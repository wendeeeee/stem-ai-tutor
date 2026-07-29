import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

@Injectable()
export class UploadStorageService {
  private readonly uploadDirectory: string;
  private readonly maxFileSize: number;

  constructor(config: ConfigService) {
    this.uploadDirectory = resolve(
      process.cwd(),
      config.get<string>('CORPUS_UPLOAD_DIR', 'var/corpus-uploads'),
    );
    this.maxFileSize = config.get<number>(
      'CORPUS_MAX_FILE_SIZE_BYTES',
      20 * 1024 * 1024,
    );
  }

  async validateAndStore(file?: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('A PDF file is required.');
    }

    if (file.size > this.maxFileSize) {
      throw new PayloadTooLargeException(
        `PDF exceeds the ${this.maxFileSize}-byte upload limit.`,
      );
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException(
        'Only application/pdf uploads are accepted.',
      );
    }

    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException(
        'The uploaded file does not have a valid PDF signature.',
      );
    }

    if (!basename(file.originalname).toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException(
        'The uploaded file must use a .pdf extension.',
      );
    }

    await mkdir(this.uploadDirectory, { recursive: true });
    const storagePath = resolve(this.uploadDirectory, `${randomUUID()}.pdf`);
    await writeFile(storagePath, file.buffer, { flag: 'wx' });

    return storagePath;
  }

  read(storagePath: string): Promise<Buffer> {
    return readFile(storagePath);
  }

  async remove(storagePath: string | null | undefined): Promise<void> {
    if (!storagePath) {
      return;
    }

    try {
      await unlink(storagePath);
    } catch (error: unknown) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      )) {
        throw error;
      }
    }
  }
}
