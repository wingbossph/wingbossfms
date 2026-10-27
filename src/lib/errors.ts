/** An error whose message is safe to show the user as-is (business rule violations). */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
