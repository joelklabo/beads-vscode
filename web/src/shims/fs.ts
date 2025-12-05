export const promises = {
  readFile: async (): Promise<never> => {
    throw new Error('fs.readFile is not available in the web shell');
  },
  writeFile: async (): Promise<never> => {
    throw new Error('fs.writeFile is not available in the web shell');
  },
};

export default { promises };
