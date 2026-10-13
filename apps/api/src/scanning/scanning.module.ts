import { Global, Module } from "@nestjs/common";
import { ClamavScannerService } from "./clamav-scanner.service";

@Global()
@Module({
  providers: [ClamavScannerService],
  exports: [ClamavScannerService],
})
export class ScanningModule {}
