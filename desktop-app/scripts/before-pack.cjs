const { verifyBuild } = require('./build-provenance.cjs')

exports.default = async function beforePack(context) {
  verifyBuild(context.packager.projectDir)
}
