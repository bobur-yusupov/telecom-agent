import type { OutageRecord } from '../outages.js'

export const outages: OutageRecord[] = [
  { region: 'Gulakandoz', status: 'clear' },
  { region: 'Khujand', status: 'clear' },
  {
    region: 'Kulob',
    status: 'active',
    affectedAreas: ['Kulob city centre', 'Vose district'],
    estimatedResolution: '2026-05-14T18:00:00Z',
    incidentId: 'INC-2026-0512',
  },
  { region: 'Dushanbe', status: 'clear' },
  { region: 'Bokhtar', status: 'clear' },
  { region: 'Istaravshan', status: 'clear' },
]
