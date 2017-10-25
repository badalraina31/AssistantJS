import { MinimalResponseHandler, OptionalHandlerFeatures } from "../interfaces";
import { BaseResponse } from "./base-response";

export class SuggestionChipsResponse extends BaseResponse {
  handler: OptionalHandlerFeatures.GUI.SuggestionChip & MinimalResponseHandler;

  constructor(handler: MinimalResponseHandler, failSilentlyOnUnsupportedFeatures: boolean) {
    super(handler, failSilentlyOnUnsupportedFeatures);

    this.reportIfUnavailable(OptionalHandlerFeatures.FeatureChecker.SuggestionChip, "The currently used platform does not support suggestion chips.");
  }

  /**
   * Adds a suggestion chip to response
   * @param {string} suggestionChip Text of suggestion chip
   * @return {SuggestionChipsResponse} This response object for method chaining
   */
  addSuggestionChip(suggestionChip: string) {
    // Initialize suggestionChips array
    if (typeof this.handler.suggestionChips === "undefined" || this.handler.suggestionChips === null) this.handler.suggestionChips = [];

    // Add new suggestion chip
    this.handler.suggestionChips.push(suggestionChip);

    return this;
  }
}