export type PostSourceRef = {
  url: string;
  title: string;
  summary: string;
};

export type PostCard = {
  id: string;
  mode: "post";
  text: string;
  sources: PostSourceRef[];
};

export type OriginalPost = {
  author: string;
  handle: string;
  text: string;
  createdAt?: string;
  avatarUrl?: string;
  tweetUrl?: string;
};

export type ReplyCard = {
  id: string;
  mode: "reply";
  original: OriginalPost;
  replies: [string, string, string];
};

export type Card = PostCard | ReplyCard;
