import { Module } from "@nestjs/common";
import { DocumentParseService } from "./document-parse.service";
import { DocxParser } from "./docx.parser";
import { PdfParser } from "./pdf.parser";
import { TextMarkdownParser } from "./text-markdown.parser";
import { WhatsAppParser } from "./whatsapp.parser";

@Module({
  providers: [
    TextMarkdownParser,
    DocxParser,
    PdfParser,
    WhatsAppParser,
    DocumentParseService,
  ],
  exports: [
    TextMarkdownParser,
    DocxParser,
    PdfParser,
    WhatsAppParser,
    DocumentParseService,
  ],
})
export class ParsingModule {}
