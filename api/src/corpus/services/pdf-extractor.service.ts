import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdf {
  pageCount: number;
  pages: ExtractedPage[];
}

@Injectable()
export class PdfExtractorService {
  async extract(buffer: Buffer): Promise<ExtractedPdf> {
    const parser = new PDFParse({
      data: buffer,
      isEvalSupported: false,
      stopAtErrors: true,
    });

    try {
      const result = await parser.getText();
      const pages = result.pages
        .map((page) => ({
          pageNumber: page.num,
          text: this.normalize(page.text),
        }))
        .filter((page) => page.text.length > 0);
      const extractedCharacters = pages.reduce(
        (total, page) => total + page.text.length,
        0,
      );

      if (pages.length === 0 || extractedCharacters < 50) {
        throw new BadRequestException(
          'The PDF contains too little extractable text. It may be scanned; OCR is not enabled in this milestone.',
        );
      }

      return {
        pageCount: result.total,
        pages,
      };
    } finally {
      await parser.destroy();
    }
  }

  private normalize(text: string): string {
    return text
      .normalize('NFKC')
      .replaceAll(String.fromCharCode(0), '')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
