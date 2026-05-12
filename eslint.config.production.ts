import { buildEslintConfig, ESLINT_TYPESCRIPT_CONFIG_FILES } from "./eslint.config";

export default buildEslintConfig({
  typescriptConfigFile: ESLINT_TYPESCRIPT_CONFIG_FILES.PRODUCTION,
});
