/** The message could not be handed to the sending service. */
export class MailDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = "MailDeliveryError";
  }
}
