require('dotenv').config();
const { GoogleGenerativeAI } = require('@google-ai/generative-ai');
const { finalizeEvent, generateSecretKey, getPublicKey } = require('nostr-tools/pure');
const { relayInit } = require('nostr-tools');
const fs = require('fs/promises');

// 環境変数からAPIキーを取得
const apiKey = process.env.GOOGLE_API_KEY;
// 定数の定義
const relay_url = 'wss://yabu.me';

if (!apiKey) {
  throw new Error('GOOGLE_API_KEYが環境変数に設定されていません');
}

// Google Generative AIクライアントを初期化
const genAI = new GoogleGenerativeAI(apiKey);

// モデルを取得
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-preview-0514' }); // モデル名が異なる可能性があるので修正

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

const file_save = async (filename, content) => {
  try {
    await fs.writeFile(filename, content, 'utf8');
  } catch (err) {
    throw err;
  }
};

const file_read = async (filename) => {
  try {
    const data = await fs.readFile(filename, 'utf8');
    return data;
  } catch (err) {
    throw err;
  }
};

// gemini_gen関数の定義
const gemini_gen = async (prompt) => {
  try {
    // プロンプトを使用してコンテンツを生成
    const result = await model.generateContent(prompt);
    // 生成されたテキストを取得して返す
    return result.response.text();
  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
};

const post = async (message) => {
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

const reply = async (message, target) => {
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', target.id],
        ['p', target.pubkey],
      ],
      content: message,
    },
    sk
  );
  await relay.publish(event);
};

const callback = async (event) => {
  if (event.pubkey === pk) return;
  if (!event.content.startsWith('sxc.')) return;
  const message = event.content.slice(4);
  if (message.startsWith('gemini.')) {
    const prompt = message.slice(7);
    const result = await gemini_gen(prompt);
    await reply(result, event); // eventオブジェクトをそのまま渡すように修正
  } else if (message === 'ping') {
    await reply('pong', event); // eventオブジェクトをそのまま渡すように修正
  }
};

// 秘密鍵の取得と公開鍵の生成
const readKeyFile = async () => {
  try {
    const keyHex = await file_read('key.txt');
    return Uint8Array.from(Buffer.from(keyHex, 'hex'));
  } catch (error) {
    console.error('キーファイルの読み込みエラー:', error);
    // 必要に応じてエラーハンドリング
    throw error;
  }
};

let sk;
let pk;
let relay;

const main = async () => {
  sk = await readKeyFile();
  pk = getPublicKey(sk);

  // Relayの接続
  relay = relayInit(relay_url);
  relay.connect();

  relay.sub(
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
};

main();