import { Code, ConnectError, createClient } from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import { LeaderboardService } from '../gen/scores/v1/leaderboard_service_pb.js'
import { ResultsService } from '../gen/scores/v1/results_service_pb.js'
import type { ScoresApi } from './interfaces/scores-api.js'

export function createScoresApi(origin: string): ScoresApi {
  const transport = createGrpcWebTransport({ baseUrl: origin })
  const leaderboard = createClient(LeaderboardService, transport)
  const results = createClient(ResultsService, transport)

  return {
    async entries(signal) {
      const { entries } = await leaderboard.getLeaderboard({}, { signal, timeoutMs: 4000 })
      return entries
    },
    async submit({ id, name, score, botScore }, signal) {
      try {
        await results.saveLocalResult({ id, name, score, botScore }, { signal, timeoutMs: 5000 })
        return 'saved'
      } catch (error) {
        return ConnectError.from(error).code === Code.InvalidArgument ? 'rejected' : 'unavailable'
      }
    },
    async rank(id, signal, timeoutMs) {
      try {
        const { result, rank } = await results.getResult({ id }, { signal, timeoutMs })
        const place = Number(rank)
        if (result && Number.isSafeInteger(place) && place > 0) {
          return { place, score: result.score }
        }
        return 'unavailable'
      } catch (error) {
        const { code } = ConnectError.from(error)
        // Fetch failures can appear as Unknown when the server is offline.
        return code === Code.NotFound || code === Code.Unavailable ||
          code === Code.DeadlineExceeded || code === Code.Unknown ? 'retry' : 'unavailable'
      }
    },
  }
}
