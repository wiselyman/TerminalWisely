declare module "pdfmake/build/pdfmake" {
  type PdfMakeDocument = {
    getBuffer(): Promise<Uint8Array>;
  };

  type PdfMakeApi = {
    addFonts(fonts: Record<string, Record<string, string>>): void;
    addVirtualFileSystem(files: Record<string, string>): void;
    createPdf(definition: Record<string, unknown>): PdfMakeDocument;
  };

  const pdfMake: PdfMakeApi;
  export default pdfMake;
}
