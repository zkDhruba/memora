import { Module } from "@nestjs/common";
import { DocumentParseService } from "./document-parse.service";
import { TextMarkdownParser } from "./text-markdown.parser";

@Module({
  providers: [TextMarkdownParser, DocumentParseService],
  exports: [TextMarkdownParser, DocumentParseService],
})
export class ParsingModule {}
