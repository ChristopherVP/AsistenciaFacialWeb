export class AppError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class ValidationError extends AppError {}
export class ModelError extends AppError {}
export class CameraError extends AppError {}
export class AttendanceError extends AppError {}
export class AlreadyTakenError extends AttendanceError {}
export class AuthError extends AppError {}
export class StorageError extends AppError {}
