import { Module } from "@nestjs/common";
import { DocumentParseService } from "./document-parse.service";
import { DocxParser } from "./docx.parser";
import { PdfParser } from "./pdf.parser";
import { TextMarkdownParser } from "./text-markdown.parser";

@Module({
  providers: [
    TextMarkdownParser,
    DocxParser,
    PdfParser,
    DocumentParseService,
  ],
  exports: [
    TextMarkdownParser,
    DocxParser,
    PdfParser,
    DocumentParseService,
  ],
})
export class ParsingModule {}
