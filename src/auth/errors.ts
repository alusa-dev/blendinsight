export class AuthorizationRequiredError extends Error {
  constructor(
    message: string,
    readonly challenge: "insufficient_scope" | "invalid_token" = "insufficient_scope",
  ) {
    super(message);
    this.name = "AuthorizationRequiredError";
  }
}
