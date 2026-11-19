pub use focus_core::workspace::Workspace;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;

#[derive(Default)]
pub struct StoreGate(pub Mutex<()>);

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("workspace-v1.json"))
        .map_err(|_| "The application data directory is unavailable.".into())
}

fn read_file(path: &Path) -> Result<Workspace, String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Workspace::default())
        }
        Err(_) => return Err("Saved workspace could not be read; it was not modified.".into()),
    };
    if metadata.len() > 2 * 1024 * 1024 {
        return Err("Saved workspace is too large; the file was not modified.".into());
    }
    let file = fs::File::open(path).map_err(|_| "Saved workspace could not be read.")?;
    let mut bytes = Vec::new();
    file.take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Saved workspace could not be read.")?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Saved workspace is too large; the file was not modified.".into());
    }
    let mut workspace: Workspace = serde_json::from_slice(&bytes).map_err(|_| {
        "Saved workspace is invalid or from an unsupported version; the file was not modified."
    })?;
    workspace.validate(super::wall_ms())?;
    Ok(workspace)
}

pub fn load(app: &AppHandle) -> Result<Workspace, String> {
    read_file(&path(app)?)
}

fn write_file(path: &Path, mut workspace: Workspace) -> Result<(), String> {
    workspace.validate(super::wall_ms())?;
    let parent = path.parent().ok_or("Invalid application data path.")?;
    fs::create_dir_all(parent).map_err(|_| "Could not create the application data directory.")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
            .map_err(|_| "Could not restrict workspace permissions.")?;
    }
    let bytes = serde_json::to_vec(&workspace).map_err(|_| "Could not serialize the workspace.")?;
    // Random, exclusively-created staging file; never truncate a predictable symlink.
    // NamedTempFile is owner-only on Unix and cleans up on a failed write.
    let mut temporary = NamedTempFile::new_in(parent)
        .map_err(|_| "Could not stage the workspace. Check disk space and permissions.")?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| "Could not finish saving the workspace.")?;
    temporary
        .persist(path)
        .map_err(|_| "Could not replace the workspace; the prior file was not modified.")?;
    #[cfg(unix)]
    {
        // Best-effort directory durability; the replacement has already succeeded.
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
    }
    Ok(())
}
pub fn save(app: &AppHandle, workspace: Workspace) -> Result<(), String> {
    write_file(&path(app)?, workspace)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn staged_writes_can_replace_an_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.json");
        write_file(&path, Workspace::default()).unwrap();
        write_file(&path, Workspace::default()).unwrap();
        read_file(&path).unwrap();
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
    #[test]
    fn malformed_existing_data_is_not_overwritten_on_load() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.json");
        fs::write(&path, b"unreadable workspace").unwrap();
        assert!(read_file(&path).is_err());
        assert_eq!(fs::read(path).unwrap(), b"unreadable workspace");
    }
    #[cfg(unix)]
    #[test]
    fn workspace_and_directory_are_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.json");
        write_file(&path, Workspace::default()).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(directory.path()).unwrap().permissions().mode() & 0o777,
            0o700
        );
    }
}
