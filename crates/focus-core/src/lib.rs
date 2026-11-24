//! Deterministic domain logic. No OS, camera, networking, storage, or Tauri access.
//! Caller-supplied monotonic/wall clocks make suspend and pause behavior replayable.

pub mod companion;
pub mod rhythm;
pub mod session;
pub mod workspace;

#[cfg(test)]
mod contracts;
