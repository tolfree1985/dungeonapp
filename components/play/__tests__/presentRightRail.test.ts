import { describe, expect, it } from 'vitest';
import { MechanicFacts, presentRightRail } from '@/components/play/presenters';

describe('presentRightRail', () => {
  it('routes summary buckets into careNow/world/opportunities and dedups', () => {
    const summary: MechanicFacts = {
      achieved: [],
      costs: [],
      turnChanges: [],
      persistent: [],
      careNow: [
        { id: "fire_spread", text: "Fire spreading", bucket: "careNow" },
        { id: "fire_spread_duplicate", text: "Fire spreading", bucket: "careNow" },
        { id: "noise", text: "Noise rising", bucket: "careNow" },
        { id: "time", text: "Time pressure", bucket: "careNow" },
        { id: "extra", text: "Extra signal", bucket: "careNow" },
      ],
      world: [
        { id: "chamber_fire", text: "Chamber is on fire", bucket: "world" },
        { id: "crate_open", text: "Crate is open", bucket: "world" },
      ],
      opportunities: [
        { id: "search", text: "Crate can be searched", bucket: "opportunities" },
        { id: "search_duplicate", text: "Crate can be searched", bucket: "opportunities" },
      ],
    };
    const presentation = presentRightRail({ mechanicFacts: summary, latestLedgerAdds: [] });
    expect(presentation.careNow).toEqual(['Fire spreading', 'Noise rising', 'Time pressure', 'Extra signal']);
    expect(presentation.world).toEqual(['Chamber is on fire', 'Crate is open']);
    expect(presentation.opportunities).toEqual(['Crate can be searched']);
  });

  it('includes showLedgerFirst when ledger entries are meaningful', () => {
    const summary: MechanicFacts = {
      achieved: [],
      costs: [],
      turnChanges: [],
      persistent: [],
      careNow: [],
      world: [],
      opportunities: [],
    };
    const presentation = presentRightRail({
      mechanicFacts: summary,
      latestLedgerAdds: [{ message: 'Fire ignited' }],
    });
    expect(presentation.showLedgerFirst).toBe(true);
  });

  it('drops ledger flag when entries are empty', () => {
    const presentation = presentRightRail({
      mechanicFacts: {
        achieved: [],
        costs: [],
        turnChanges: [],
        persistent: [],
        careNow: [],
        world: [],
        opportunities: [],
      },
      latestLedgerAdds: [],
    });
    expect(presentation.showLedgerFirst).toBe(false);
  });
});
