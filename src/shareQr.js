export const SHARE_QR_TOO_LARGE = "too_large";
export const SHARE_QR_FAILED = "generation_failed";

export async function generateShareQrDataUrl(url) {
  try {
    const qrModule = await import("qrcode");
    const QRCode = qrModule.default || qrModule;
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "L",
      margin: 4,
      width: 512,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    });
    return { dataUrl, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      dataUrl: null,
      error: /too big|overflow/i.test(message) ? SHARE_QR_TOO_LARGE : SHARE_QR_FAILED,
    };
  }
}
