import { Module } from "@nestjs/common";
import { ChunkingModule } from "../chunking/chunking.module";
import { DocumentParseService } from "./document-parse.service";
import { DocxParser } from "./docx.parser";
import { PdfParser } from "./pdf.parser";
import { TextMarkdownParser } from "./text-markdown.parser";
import { WhatsAppParser } from "./whatsapp.parser";

@Module({
  imports: [ChunkingModule],
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
    ChunkingModule,
  ],
})
export class ParsingModule {}
