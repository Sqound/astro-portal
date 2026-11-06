import { placesExtractOffer } from "portal/places/extract-offer.js";
import { placesFailure } from "../../../../../lib/v1/places-response.js";
export async function GET() {
  try {
    return await placesExtractOffer();
  } catch (error) {
    return placesFailure(error);
  }
}
