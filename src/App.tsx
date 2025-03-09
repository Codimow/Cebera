import React, { useEffect, useState, useRef } from 'react';
import { Mic, Send, Volume2, Power, AudioWaveform as Waveform, Maximize2 } from 'lucide-react';
import { AudioCodec } from './lib/audioCodec';

function App() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Array<{ text: string; timestamp: string }>>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [audioCodec] = useState(() => new AudioCodec());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const subscription = audioCodec.onDecode().subscribe(text => {
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, { text, timestamp }]);
    });

    return () => {
      subscription.unsubscribe();
      audioCodec.stopListening();
    };
  }, [audioCodec]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!canvasRef.current || !isListening) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const analyser = audioCodec.getAnalyser();
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!isListening) return;

      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgb(0, 20, 0)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        const hue = (i / bufferLength) * 120;
        ctx.fillStyle = `hsl(${hue}, 100%, ${Math.min(barHeight, 50)}%)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }, [isListening, audioCodec]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    try {
      setIsSending(true);
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, { text: inputText, timestamp }]);
      await audioCodec.encodeText(inputText);
      setInputText('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      audioCodec.stopListening();
      setIsListening(false);
    } else {
      try {
        await audioCodec.startListening();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting listener:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-500 p-4 font-mono">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-6 border-b border-green-900/50 pb-4">
          <div className="flex items-center gap-3">
            <Power className="w-6 h-6 text-green-400" />
            <h1 className="text-2xl font-bold tracking-wider">AUDIO CODEC v2.0</h1>
          </div>
          <div className="flex items-center gap-2">
            <Waveform className="w-5 h-5 animate-pulse" />
            <span className="text-sm opacity-75">FREQ: 2000-4800 Hz</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-black/50 border border-green-900/50 rounded-lg p-4 h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-black">
              {messages.map((msg, i) => (
                <div key={i} className="mb-3">
                  <div className="text-xs text-green-700 mb-1">[{msg.timestamp}]</div>
                  <div className="font-mono break-all">{msg.text}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Enter message..."
                className="flex-1 bg-black/30 border border-green-900/50 rounded-lg px-4 py-2 text-green-400 placeholder-green-900 focus:outline-none focus:border-green-700"
              />
              <button
                onClick={handleSend}
                disabled={isSending || !inputText.trim()}
                className="bg-green-900/20 hover:bg-green-900/30 disabled:opacity-50 disabled:cursor-not-allowed text-green-400 rounded-lg px-4 py-2 transition-colors flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                TX
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative bg-black/50 border border-green-900/50 rounded-lg p-4 h-[400px] flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={600}
                height={300}
                className="w-full h-full"
              />
              <div className="absolute top-2 right-2 flex items-center gap-2 text-xs text-green-700">
                <Maximize2 className="w-4 h-4" />
                <span>FFT: 4096</span>
              </div>
            </div>

            <button
              onClick={toggleListening}
              className={`w-full ${
                isListening 
                  ? 'bg-red-900/20 hover:bg-red-900/30 text-red-400' 
                  : 'bg-green-900/20 hover:bg-green-900/30 text-green-400'
              } rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2`}
            >
              {isListening ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isListening ? 'STOP RX' : 'START RX'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;