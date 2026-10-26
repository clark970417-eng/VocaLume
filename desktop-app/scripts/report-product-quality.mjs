/** node scripts/report-product-quality.mjs CORPUS QUALITY_JSON SOAK_JSON OUTPUT_DIR */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {validateCorpus, qualitySummary, soakSummary, reviewSheet, sha256} from './product-quality.mjs';
const [corpusPath, qualityPath, soakPath, outputPath] = process.argv.slice(2);
if (![corpusPath, qualityPath, soakPath, outputPath].every(Boolean)) throw new Error('Expected corpus, quality report, soak report, output directory');
const load = path => JSON.parse(readFileSync(path, 'utf8'));
const corpusBytes = readFileSync(corpusPath);
const corpus = validateCorpus(JSON.parse(corpusBytes)), quality = load(qualityPath), soak = load(soakPath);
const output = resolve(outputPath); mkdirSync(output, {recursive:true});
const summary = {quality:qualitySummary(quality, corpus, sha256(corpusBytes)), soak:soakSummary(soak),
  system:quality.system, engines:quality.engines, fixtureHash:quality.fixtureHash,
  releaseDecision:'Preview only. Human bilingual review and cross-device physical measurements are still required.'};
writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
writeFileSync(join(output, 'human-review.json'), JSON.stringify(reviewSheet(quality, corpus), null, 2) + '\n');
console.log(JSON.stringify(summary));
if (!summary.quality.complete || !summary.soak.complete) process.exitCode = 1;
