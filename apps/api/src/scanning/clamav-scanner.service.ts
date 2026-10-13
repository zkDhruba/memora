import { Injectable } from "@nestjs/common";
import { connect } from "node:net";
import { env } from "../config/env";

export type ScanResult =
  | { clean: true }
  | { clean: false; signature: string };

/**
 * ClamAV `clamd` INSTREAM scanner over TCP.
 * Protocol: zINSTREAM\0 + length-prefixed chunks + zero-length terminator.
 */
@Injectable()
export class ClamavScannerService {
  async scanBuffer(data: Buffer): Promise<ScanResult> {
    if (env.clamav.skip()) {
      // Dev/test escape hatch — treat as clean unless buffer is EICAR.
      const eicar =
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
      if (data.includes(Buffer.from(eicar, "utf8"))) {
        return { clean: false, signature: "Eicar-Signature" };
      }
      return { clean: true };
    }

    const host = env.clamav.host();
    const port = env.clamav.port();

    return new Promise<ScanResult>((resolve, reject) => {
      const socket = connect({ host, port });
      let settled = false;
      let response = "";

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(err);
      };

      const ok = (result: ScanResult) => {
        if (settled) return;
        settled = true;
        socket.end();
        resolve(result);
      };

      socket.setTimeout(60_000);
      socket.on("timeout", () =>
        fail(new Error(`ClamAV scan timed out (${host}:${port})`)),
      );
      socket.on("error", (err) => fail(err));

      socket.on("connect", () => {
        // null-terminated command
        socket.write(Buffer.from("zINSTREAM\0", "utf8"));

        const chunkSize = 2048;
        for (let offset = 0; offset < data.length; offset += chunkSize) {
          const slice = data.subarray(offset, offset + chunkSize);
          const header = Buffer.alloc(4);
          header.writeUInt32BE(slice.length, 0);
          socket.write(header);
          socket.write(slice);
        }
        const end = Buffer.alloc(4);
        end.writeUInt32BE(0, 0);
        socket.write(end);
      });

      socket.on("data", (buf) => {
        response += buf.toString("utf8");
        // clamd replies with a single line ending in \0 for z* commands
        if (response.includes("\0") || response.includes("\n")) {
          const line = response.replace(/\0/g, "").trim();
          if (/:\s*OK$/i.test(line)) {
            ok({ clean: true });
            return;
          }
          const found = line.match(/:\s*(.+)\s+FOUND$/i);
          if (found?.[1]) {
            ok({ clean: false, signature: found[1].trim() });
            return;
          }
          fail(new Error(`Unexpected ClamAV response: ${line}`));
        }
      });

      socket.on("end", () => {
        if (settled) return;
        const line = response.replace(/\0/g, "").trim();
        if (/:\s*OK$/i.test(line)) {
          ok({ clean: true });
          return;
        }
        const found = line.match(/:\s*(.+)\s+FOUND$/i);
        if (found?.[1]) {
          ok({ clean: false, signature: found[1].trim() });
          return;
        }
        fail(
          new Error(
            `ClamAV closed without result (${host}:${port}): ${line || "(empty)"}`,
          ),
        );
      });
    });
  }
}
