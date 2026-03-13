declare module "epub-gen" {
  export default class Epub {
    constructor(options: Record<string, unknown>, output: string);
    promise: Promise<void>;
  }
}