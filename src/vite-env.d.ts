/// <reference types="vite/client" />

declare const __VANARA_BUILD_ID__: string;

declare module "*.JPG" {
  const src: string;
  export default src;
}
