export class AuthError extends Error {
  constructor(message = "Invalid credentials", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export class TokenError extends Error {
  constructor(message = "Invalid or expired token", status = 401) {
    super(message);
    this.name = "TokenError";
    this.status = status;
  }
}
