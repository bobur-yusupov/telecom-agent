export interface OutageRecord {
  region: string
  status: 'active' | 'clear'
  affectedAreas?: string[]
  estimatedResolution?: string  // ISO 8601
  incidentId?: string
}

export const outages: OutageRecord[] = [
  {
    region: 'Kulob',
    status: 'active',
    affectedAreas: ['Kulob city centre', 'Vose district'],
    estimatedResolution: '2026-05-14T18:00:00Z',
    incidentId: 'INC-2026-0512',
  },
  { region: 'Dushanbe', status: 'clear' },
  { region: 'Khujand', status: 'clear' },
  { region: 'Bokhtar', status: 'clear' },
  { region: 'Istaravshan', status: 'clear' },
]

export function getOutageByRegion(region: string): OutageRecord {
  return outages.find((o) => o.region.toLowerCase() === region.toLowerCase()) ?? {
    region,
    status: 'clear',
  }
}
