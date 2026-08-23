export const SHARE_QR_TOO_LARGE = "too_large";
export const SHARE_QR_FAILED = "generation_failed";

export function classifyShareQrError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /amount of data is too big|cannot contain this amount of data|code length overflow/i.test(message)
    ? SHARE_QR_TOO_LARGE
    : SHARE_QR_FAILED;
}

export async function generateShareQrDataUrl(url) {
  try {
    const qrModule = await import("qrcode");
    const QRCode = qrModule.default || qrModule;
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "L",
      margin: 4,
      width: 512,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    });
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return { dataUrl, error: null };
  } catch (error) {
    return {
      dataUrl: null,
      error: classifyShareQrError(error),
    };
  }
}
