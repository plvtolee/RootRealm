export type LeaderboardRow = {
  id: string;
  rank: number;
  player: string;
  score: number;
  status: "Eligible" | "Pending" | "Opted out";
  optIn: boolean;
};

export const LEADERBOARD_SEASON = {
  label: "Season 7",
  points: "2,384,940 pts",
  deadline: "Ends in 12 days",
};

export const LEADERBOARD_ROWS: readonly LeaderboardRow[] = [
  { id: "s1", rank: 1, player: "luna.builds", score: 28420, status: "Eligible", optIn: true },
  { id: "s2", rank: 2, player: "vradix", score: 27310, status: "Eligible", optIn: true },
  { id: "s3", rank: 3, player: "marta.codes", score: 26890, status: "Eligible", optIn: true },
  { id: "s4", rank: 4, player: "plvtolee", score: 24680, status: "Pending", optIn: false },
  { id: "s5", rank: 5, player: "synth.guy", score: 23190, status: "Eligible", optIn: true },
  { id: "s6", rank: 6, player: "c0rebot", score: 22010, status: "Opted out", optIn: false },
];
