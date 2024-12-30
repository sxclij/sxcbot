import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { Relay } from "nostr-tools/relay";
import { writeFile, readFile } from "fs/promises";
// .envファイルの内容を読み込む
config();

// 環境変数からAPIキーを取得
const apiKey = process.env.GOOGLE_API_KEY;
// 定数の定義
const relay_url = "wss://yabu.me";


if (!apiKey) {
  throw new Error('GOOGLE_API_KEYが環境変数に設定されていません');
}

// Google Generative AIクライアントを初期化
const genAI = new GoogleGenerativeAI(apiKey);

// モデルを取得
const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });

const sleep = (time: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, time));

const file_save = async (filename: string, content: string): Promise<void> => {
  try {
    await writeFile(filename, content, "utf8");
  } catch (err) {
    throw err;
  }
};

const file_read = async (filename: string): Promise<string> => {
  try {
    const data = await readFile(filename, "utf8");
    return data;
  } catch (err) {
    throw err;
  }
};


// gemini_gen関数の定義
const gemini_gen = async (prompt: string): Promise<string> => {
  try {
    // プロンプトを使用してコンテンツを生成
    const result = await model.generateContent([prompt]);
    // 生成されたテキストを取得して返す
    return result.response.text();
  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
};

const post = async (message: string): Promise<void> => {
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: message,
    },
    sk
  );
  await relay.publish(event);
};

const reply = async (message: string, target: { id: string; pubkey: string }): Promise<void> => {
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", target.id],
        ["p", target.pubkey],
      ],
      content: message,
    },
    sk
  );
  await relay.publish(event);
};

const callback = async (event: { pubkey: string; content: string }): Promise<void> => {
  if (event.pubkey === pk) return;
  if (!event.content.startsWith("sxc.")) return;

  const message = event.content.slice(4);
};


// 秘密鍵の取得と公開鍵の生成
const sk = Uint8Array.from(Buffer.from(await file_read("key.txt"), "hex"));
const pk = getPublicKey(sk);

// Relayの接続
const relay = await Relay.connect(relay_url);

relay.subscribe(
  [
    {
      kinds: [1],
      since: Math.floor(Date.now() / 1000),
    },
  ],
  {
    onevent(event) {
      callback(event);
    },
  }
);
