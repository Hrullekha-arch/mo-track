let jsPdfModule: typeof import("jspdf")["jsPDF"] | null = null;
let html2CanvasModule: typeof import("html2canvas")["default"] | null = null;

export async function exportElementToPdf(
  elementId: string,
  filename: string
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Element not found");

  // Lazy-load heavy libraries only when user clicks "Download PDF"
  const [jsPdf, html2canvas] = await Promise.all([
    import("jspdf").then((mod) => {
      jsPdfModule = mod.jsPDF;
      return mod.jsPDF;
    }),
    import("html2canvas").then((mod) => {
      html2CanvasModule = mod.default;
      return mod.default;
    }),
  ]);

  const canvas = await html2canvas(element, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPdf("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
  const imgX = (pdfWidth - imgWidth * ratio) / 2;

  pdf.addImage(imgData, "PNG", imgX, 0, imgWidth * ratio, imgHeight * ratio);
  pdf.save(filename);
}