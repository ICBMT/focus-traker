pub use focus_core::workspace::Workspace;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;

const MAX_WORKSPACE_BYTES: u64 = 2 * 1024 * 1024;
#[derive(Default)]
pub struct StoreGate(pub Mutex<()>);

// An OS-owned advisory lock, not a PID/heartbeat file. The kernel releases it
// after a crash. The file is intentionally never unlinked while in use.
pub struct InstanceGuard {
    _file: fs::File,
}
impl InstanceGuard {
    pub fn acquire(directory: &Path) -> Result<Self, String> {
        prepare_directory(directory)?;
        let mut options = fs::OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options
            .open(directory.join("workspace.lock"))
            .map_err(|_| "Could not open the workspace ownership lock.")?;
        file.try_lock().map_err(|_| {
            "Focus is already running, or exclusive storage is unavailable. Close the other Focus instance before opening this workspace."
        })?;
        Ok(Self { _file: file })
    }
}
fn prepare_directory(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory)
        .map_err(|_| "Could not create the application data directory.")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
            .map_err(|_| "Could not restrict workspace permissions.")?;
    }
    Ok(())
}
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("workspace-v1.json"))
        .map_err(|_| "The application data directory is unavailable.".into())
}
fn read_file(path: &Path) -> Result<Workspace, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Workspace::default())
        }
        Err(_) => return Err("Saved workspace could not be read; it was not modified.".into()),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Saved workspace is not a regular file; it was not modified.".into());
    }
    if metadata.len() > MAX_WORKSPACE_BYTES {
        return Err("Saved workspace is too large; the file was not modified.".into());
    }
    let file = fs::File::open(path).map_err(|_| "Saved workspace could not be read.")?;
    let mut bytes = Vec::new();
    file.take(MAX_WORKSPACE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Saved workspace could not be read.")?;
    if bytes.len() as u64 > MAX_WORKSPACE_BYTES {
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
fn write_json(path: &Path, mut workspace: Workspace, private_parent: bool) -> Result<(), String> {
    workspace.validate(super::wall_ms())?;
    let parent = path.parent().ok_or("Invalid workspace path.")?;
    if private_parent {
        prepare_directory(parent)?;
    }
    let bytes = serde_json::to_vec(&workspace).map_err(|_| "Could not serialize the workspace.")?;
    if bytes.len() as u64 > MAX_WORKSPACE_BYTES {
        return Err("The workspace exceeded its storage limit; no file was replaced.".into());
    }
    // Random, exclusively-created staging file, owner-only on Unix. A failed
    // write never truncates the destination. Export never chmods a user's folder.
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
    if let Ok(directory) = fs::File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}
pub fn save(app: &AppHandle, workspace: Workspace) -> Result<(), String> {
    write_json(&path(app)?, workspace, true)
}
pub fn export(path: &Path, mut workspace: Workspace) -> Result<(), String> {
    workspace.checkpoint = None;
    write_json(path, workspace, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn staged_writes_can_replace_an_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.json");
        write_json(&path, Workspace::default(), true).unwrap();
        write_json(&path, Workspace::default(), true).unwrap();
        read_file(&path).unwrap();
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
    #[test]
    fn malformed_existing_data_is_not_overwritten_on_load() {
        for bytes in [
            b"unreadable workspace".as_slice(),
            b"null",
            b"[]",
            b"{}",
            b"",
        ] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("workspace.json");
            fs::write(&path, bytes).unwrap();
            assert!(read_file(&path).is_err());
            assert_eq!(fs::read(path).unwrap(), bytes);
        }
    }
    #[test]
    fn missing_data_is_empty_but_directories_and_oversized_files_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.json");
        read_file(&path).unwrap();
        assert!(read_file(directory.path()).is_err());
        fs::File::create(&path)
            .unwrap()
            .set_len(MAX_WORKSPACE_BYTES + 1)
            .unwrap();
        assert!(read_file(&path).is_err());
        assert_eq!(fs::metadata(path).unwrap().len(), MAX_WORKSPACE_BYTES + 1);
    }
    #[test]
    fn kernel_ownership_prevents_two_writers_and_releases_after_drop() {
        let directory = tempfile::tempdir().unwrap();
        let first = InstanceGuard::acquire(directory.path()).unwrap();
        assert!(InstanceGuard::acquire(directory.path()).is_err());
        drop(first);
        assert!(InstanceGuard::acquire(directory.path()).is_ok());
    }
    #[test]
    fn failed_replacement_does_not_remove_an_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("existing-directory");
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("keep.txt"), b"keep").unwrap();
        assert!(write_json(&destination, Workspace::default(), false).is_err());
        assert_eq!(fs::read(destination.join("keep.txt")).unwrap(), b"keep");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
    #[cfg(unix)]
    #[test]
    fn workspace_and_directory_are_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("workspace.json");
        write_json(&path, Workspace::default(), true).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(directory.path()).unwrap().permissions().mode() & 0o777,
            0o700
        );
    }
    #[cfg(unix)]
    #[test]
    fn exports_are_private_without_changing_destination_directory_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        fs::set_permissions(directory.path(), fs::Permissions::from_mode(0o755)).unwrap();
        let path = directory.path().join("export.json");
        export(&path, Workspace::default()).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(directory.path()).unwrap().permissions().mode() & 0o777,
            0o755
        );
    }
    #[cfg(unix)]
    #[test]
    fn saved_symlinks_are_not_followed() {
        use std::os::unix::fs::symlink;
        let directory = tempfile::tempdir().unwrap();
        let real = directory.path().join("original.json");
        fs::write(&real, b"private original").unwrap();
        let link = directory.path().join("workspace.json");
        symlink(&real, &link).unwrap();
        assert!(read_file(&link).is_err());
        assert_eq!(fs::read(real).unwrap(), b"private original");
    }
}
