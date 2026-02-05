module.exports = [
    {
      files: ["**/*.js"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "commonjs",
        globals: {
          console: "readonly",
          process: "readonly",
          fetch: "readonly",
          describe: "readonly", // Jest globals
          test: "readonly",
          expect: "readonly",
          beforeEach: "readonly",
          afterEach: "readonly"
        },
      },
      rules: {
        "no-unused-vars": "error",
        "no-undef": "error",
        "semi": ["error", "always"],
      },
    },
  ];
  