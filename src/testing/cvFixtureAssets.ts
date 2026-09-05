import crowdedBoardEight from '../../fixtures/cv/crowded-board-eight/expected.json';
import crowdedBoardEleven from '../../fixtures/cv/crowded-board-eleven/expected.json';
import crowdedBoardThirteen from '../../fixtures/cv/crowded-board-thirteen/expected.json';
import falsePositiveAidBacks from '../../fixtures/cv/false-positives-aid-backs/expected.json';
import falsePositiveAidFronts from '../../fixtures/cv/false-positives-aid-fronts/expected.json';
import fourCardsGrid from '../../fixtures/cv/four-cards-grid/expected.json';
import fourCardsPerspective from '../../fixtures/cv/four-cards-perspective/expected.json';
import fourCardsRotated from '../../fixtures/cv/four-cards-rotated/expected.json';
import glareGolemFront from '../../fixtures/cv/glare-golem-front/expected.json';
import glareGolemRotated from '../../fixtures/cv/glare-golem-rotated/expected.json';
import partialOverlapHeavy from '../../fixtures/cv/partial-overlap-heavy/expected.json';
import partialOverlapLight from '../../fixtures/cv/partial-overlap-light/expected.json';
import perspectiveGnomeQuarterTurn from '../../fixtures/cv/perspective-gnome-quarter-turn/expected.json';
import perspectiveGolemLowAngleClose from '../../fixtures/cv/perspective-golem-low-angle-close/expected.json';
import perspectiveGolemLowAngleWide from '../../fixtures/cv/perspective-golem-low-angle-wide/expected.json';
import perspectiveThreeCards from '../../fixtures/cv/perspective-three-cards/expected.json';
import singleCardGnomeFront from '../../fixtures/cv/single-card-gnome-front/expected.json';
import { type CvFixtureManifest, parseCvFixtureManifest } from './cvFixtureManifest';

export type CvFixtureAsset = {
  readonly name: string;
  readonly resourceName: string;
  readonly manifest: CvFixtureManifest;
};

function fixture(name: string, manifest: unknown): CvFixtureAsset {
  return {
    name,
    resourceName: `cv-fixtures/${name}.jpg`,
    manifest: parseCvFixtureManifest(manifest),
  };
}

/** Static manifest registry paired with JPEGs copied into Android's debug-only assets. */
export const CV_FIXTURE_ASSETS: readonly CvFixtureAsset[] = [
  fixture('crowded-board-eight', crowdedBoardEight),
  fixture('crowded-board-eleven', crowdedBoardEleven),
  fixture('crowded-board-thirteen', crowdedBoardThirteen),
  fixture('false-positives-aid-backs', falsePositiveAidBacks),
  fixture('false-positives-aid-fronts', falsePositiveAidFronts),
  fixture('four-cards-grid', fourCardsGrid),
  fixture('four-cards-perspective', fourCardsPerspective),
  fixture('four-cards-rotated', fourCardsRotated),
  fixture('glare-golem-front', glareGolemFront),
  fixture('glare-golem-rotated', glareGolemRotated),
  fixture('partial-overlap-heavy', partialOverlapHeavy),
  fixture('partial-overlap-light', partialOverlapLight),
  fixture('perspective-gnome-quarter-turn', perspectiveGnomeQuarterTurn),
  fixture('perspective-golem-low-angle-close', perspectiveGolemLowAngleClose),
  fixture('perspective-golem-low-angle-wide', perspectiveGolemLowAngleWide),
  fixture('perspective-three-cards', perspectiveThreeCards),
  fixture('single-card-gnome-front', singleCardGnomeFront),
];
