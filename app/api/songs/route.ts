import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as mm from 'music-metadata';

export async function GET() {
  const musicDirectory = path.join(process.cwd(), 'public', 'music');
  
  try {
    const filenames = fs.readdirSync(musicDirectory);
    const mp3Files = filenames.filter(name => name.endsWith('.mp3'));

    const playlist = await Promise.all(mp3Files.map(async (name) => {
      const filePath = path.join(musicDirectory, name);
      const metadata = await mm.parseFile(filePath);

      let cover = null;
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const picture = metadata.common.picture[0];
        // Wrap Uint8Array with Buffer.from() to allow 'base64' encoding
        const base64Data = Buffer.from(picture.data).toString('base64');
        cover = `data:${picture.format};base64,${base64Data}`;
      }

      return {
        title: metadata.common.title || name.replace('.mp3', ''),
        artist: metadata.common.artist || "Unknown Artist",
        src: `/music/${name}`,
        cover: cover // Embedded Album Art
      };
    }));

    return NextResponse.json(playlist);
  } catch (error) {
    console.error("Error reading music directory:", error);
    return NextResponse.json([]);
  }
}