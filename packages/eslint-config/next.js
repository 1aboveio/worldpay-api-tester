/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["./base.js"],
  plugins: ["@next/eslint-plugin-next"],
  rules: {
    "@next/next/no-html-link-for-pages": "error",
  },
};
