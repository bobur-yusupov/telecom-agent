import { Mastra } from '@mastra/core/mastra'
import { mirzo } from '../agents/mirzo.js'

export const mastra = new Mastra({
  agents: { mirzo },
})
