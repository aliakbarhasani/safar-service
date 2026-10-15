'use strict';

const { main } = require('../run-migration');

describe('deprecated standalone migration runner', () => {
  test('fails closed and directs operators to the checksum-validated runner', () => {
    const originalExitCode = process.exitCode;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      main();

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('npm run db:migrate')
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsafe legacy migration runner disabled')
      );
    } finally {
      process.exitCode = originalExitCode;
      errorSpy.mockRestore();
    }
  });
});
