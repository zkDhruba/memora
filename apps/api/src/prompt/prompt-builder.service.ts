import { Injectable } from "@nestjs/common";
import {
  buildChatPrompt,
  buildRetrievalQuery,
  type BuiltPrompt,
  type PromptBuildInput,
} from "./prompt-builder";

/** Nest-facing wrapper around the pure prompt builder (3.7). */
@Injectable()
export class PromptBuilderService {
  build(input: PromptBuildInput): BuiltPrompt {
    return buildChatPrompt(input);
  }

  retrievalQuery(
    userMessage: string,
    previousUserMessage?: string | null,
  ): string {
    return buildRetrievalQuery(userMessage, previousUserMessage);
  }
}
