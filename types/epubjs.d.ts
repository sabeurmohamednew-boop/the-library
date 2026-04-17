declare module "epubjs" {
  const ePub: (url?: string | ArrayBuffer, options?: Record<string, unknown>) => any;
  export default ePub;
}
