import { compress } from '@assetpack/core/image'
import { texturePacker, texturePackerCompress } from '@assetpack/core/texture-packer'

const compression = {
  png: 'skip',
  webp: false,
  basis: {
    options: ['-uastc_level', '2', '-uastc_rdo_l', '0.75', '-no_multithreading'],
  },
}

export default {
  entry: './assets',
  ignore: ['**/.DS_Store'],
  cache: false,
  strict: true,
  assetSettings: [{ files: ['arena', 'ui'], settings: {}, metaData: { tps: true } }],
  pipes: [
    texturePacker({
      resolutionOptions: { resolutions: { default: 1 } },
      texturePacker: { allowRotation: false, allowTrim: false, removeFileExtension: true },
    }),
    compress(compression),
    texturePackerCompress(compression),
  ],
}
