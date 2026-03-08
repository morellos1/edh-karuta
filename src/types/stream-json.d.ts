declare module "stream-json" {
  const streamJson: {
    parser: (options?: unknown) => NodeJS.ReadWriteStream;
  };
  export default streamJson;
}

declare module "stream-json/streamers/StreamArray.js" {
  const streamArrayModule: {
    streamArray: (options?: unknown) => AsyncIterable<{ value: unknown }> & NodeJS.ReadWriteStream;
  };
  export default streamArrayModule;
}
