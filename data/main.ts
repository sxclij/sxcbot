import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// .envファイルの内容を読み込む
config();

// 環境変数からAPIキーを取得
const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error('GOOGLE_API_KEYが環境変数に設定されていません');
}

// Google Generative AIクライアントを初期化
const genAI = new GoogleGenerativeAI(apiKey);

// モデルを取得
const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });

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

async function main() {
    const prompt = 'Gemini 1.5 Flash について教えてください。';
    const generatedText = await gemini_gen(prompt);
  
    if (generatedText) {
      console.log('生成されたテキスト:', generatedText);
    } else {
      console.log('テキスト生成に失敗しました。');
    }
  }
  
  main();