class RgbFullSynth extends AudioWorkletProcessor {
    constructor() {
        super();
        this.config = null;
        this.t = 0;
        this.samplesPerColumn = 0;
        this.durationPerColumn = 0.1;
        this.detuneAmount = 1;
        this.stereoWidth = 1;
        this.lastColumnReported = -1;
        this.attackTime = 0;
        this.decayTime = 0;
        this.harmonicCount = 100;
        this.harmonicMode = "all";
        this.baseOctave = 3;
        this.phaseAmount = 1;
        this.defaultTonalNotes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        this.tonalNotes = this.defaultTonalNotes.slice();

        this.port.onmessage = (event) => {
            if (event.data.type === "config") {
                this.config = event.data;
                this.durationPerColumn = event.data.durationPerColumn;
                this.detuneAmount = event.data.detuneAmount ?? 1;
                this.stereoWidth = event.data.stereoWidth ?? 1;
                this.samplesPerColumn = Math.max(1, Math.floor(
                    this.durationPerColumn * this.config.sampleRate
                ));
                if (typeof event.data.baseFreq === "number") {
                    this.config.baseFreq = event.data.baseFreq;
                }
                if (typeof event.data.harmonicCount === "number") {
                    this.harmonicCount = Math.max(1, Math.floor(event.data.harmonicCount));
                    this.config.harmonicCount = this.harmonicCount;
                }
                if (Array.isArray(event.data.tonalNotes)) {
                    this.tonalNotes = this.sanitizeTonalNotes(event.data.tonalNotes);
                    this.config.tonalNotes = this.tonalNotes;
                }
                if (typeof event.data.baseOctave === "number") {
                    const oct = Math.round(event.data.baseOctave);
                    this.baseOctave = Math.min(8, Math.max(-1, oct));
                    this.config.baseOctave = this.baseOctave;
                }
                if (typeof event.data.harmonicMode === "string") {
                    this.harmonicMode = this.normalizeMode(event.data.harmonicMode);
                    this.config.harmonicMode = this.harmonicMode;
                }
                if (typeof event.data.phaseAmount === "number") {
                    this.phaseAmount = Math.max(0, event.data.phaseAmount);
                    this.config.phaseAmount = this.phaseAmount;
                }
                this.setAttack(event.data.attackTime ?? this.attackTime);
                this.setDecay(event.data.decayTime ?? this.decayTime);
                this.config.attackTime = this.attackTime;
                this.config.decayTime = this.decayTime;
                this.t = 0;
                this.lastColumnReported = -1;
            } else if (event.data.type === "params" && this.config) {
                if (typeof event.data.durationPerColumn === "number") {
                    this.durationPerColumn = event.data.durationPerColumn;
                    this.samplesPerColumn = Math.max(1, Math.floor(
                        this.durationPerColumn * this.config.sampleRate
                    ));
                    this.config.durationPerColumn = this.durationPerColumn;
                }
                if (typeof event.data.detuneAmount === "number") {
                    this.detuneAmount = event.data.detuneAmount;
                    this.config.detuneAmount = this.detuneAmount;
                }
                if (typeof event.data.stereoWidth === "number") {
                    this.stereoWidth = event.data.stereoWidth;
                    this.config.stereoWidth = this.stereoWidth;
                }
                if (typeof event.data.baseFrequency === "number") {
                    this.config.baseFreq = event.data.baseFrequency;
                }
                if (typeof event.data.harmonicCount === "number") {
                    this.harmonicCount = Math.max(1, Math.floor(event.data.harmonicCount));
                    this.config.harmonicCount = this.harmonicCount;
                }
                if (Array.isArray(event.data.tonalNotes)) {
                    this.tonalNotes = this.sanitizeTonalNotes(event.data.tonalNotes);
                    this.config.tonalNotes = this.tonalNotes;
                }
                if (typeof event.data.baseOctave === "number") {
                    const oct = Math.round(event.data.baseOctave);
                    this.baseOctave = Math.min(8, Math.max(-1, oct));
                    this.config.baseOctave = this.baseOctave;
                }
                if (typeof event.data.harmonicMode === "string") {
                    this.harmonicMode = this.normalizeMode(event.data.harmonicMode);
                    this.config.harmonicMode = this.harmonicMode;
                }
                if (typeof event.data.phaseAmount === "number") {
                    this.phaseAmount = Math.max(0, event.data.phaseAmount);
                    this.config.phaseAmount = this.phaseAmount;
                }
                if (typeof event.data.attackTime === "number") {
                    this.setAttack(event.data.attackTime);
                    this.config.attackTime = this.attackTime;
                }
                if (typeof event.data.decayTime === "number") {
                    this.setDecay(event.data.decayTime);
                    this.config.decayTime = this.decayTime;
                }
            } else if (event.data.type === "pixels" && this.config && event.data.pixelData) {
                this.config.pixelData = event.data.pixelData;
                this.lastColumnReported = -1;
            }
        };
    }

    setAttack(timeSeconds) {
        this.attackTime = Math.max(0, timeSeconds || 0);
    }

    setDecay(timeSeconds) {
        this.decayTime = Math.max(0, timeSeconds || 0);
    }

    normalizeMode(mode) {
        if (typeof mode !== 'string') return this.harmonicMode || 'all';
        const value = mode.toLowerCase();
        if (value === 'odd' || value === 'even' || value === 'tonal') {
            return value;
        }
        return 'all';
    }

    sanitizeTonalNotes(notes) {
        if (!Array.isArray(notes)) return this.defaultTonalNotes.slice();
        const sanitized = [];
        for (const n of notes) {
            const num = Number(n);
            if (!Number.isFinite(num)) continue;
            const wrapped = ((Math.round(num) % 12) + 12) % 12;
            if (!sanitized.includes(wrapped)) sanitized.push(wrapped);
        }
        return sanitized.length ? sanitized : this.defaultTonalNotes.slice();
    }

    computeTonalFrequency(rowIndex) {
        const notes = (this.tonalNotes && this.tonalNotes.length) ? this.tonalNotes : this.defaultTonalNotes;
        const noteCount = notes.length;
        if (noteCount === 0) {
            return (this.config && typeof this.config.baseFreq === "number") ? this.config.baseFreq : 440;
        }
        const baseOct = Number.isFinite(this.baseOctave) ? Math.floor(this.baseOctave) : 3;
        const noteIndex = rowIndex % noteCount;
        const octaveOffset = Math.floor(rowIndex / noteCount);
        const semitone = notes[noteIndex];
        const midi = ((baseOct + 1 + octaveOffset) * 12) + semitone;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    computeEnvelope(sampleIndex) {
        if (!this.config || !this.config.sampleRate) return 1;
        const total = this.samplesPerColumn || 0;
        if (total <= 0) return 1;
        const sr = this.config.sampleRate;

        let envelope = 1;
        const attackSamples = Math.min(total, Math.max(0, Math.round(this.attackTime * sr)));
        if (attackSamples > 0 && sampleIndex < attackSamples) {
            envelope = sampleIndex / attackSamples;
        }

        const decaySamples = Math.min(total, Math.max(0, Math.round(this.decayTime * sr)));
        if (decaySamples > 0) {
            const decayStart = Math.max(0, total - decaySamples);
            if (sampleIndex >= decayStart) {
                const remaining = total - sampleIndex;
                const decayEnv = decaySamples > 0 ? remaining / decaySamples : 1;
                envelope = Math.min(envelope, decayEnv);
            }
        }

        if (envelope < 0) envelope = 0;
        if (envelope > 1) envelope = 1;
        return envelope;
    }

    process(inputs, outputs) {
        if (!this.config) return true;

        const output = outputs[0];
        const L = output[0];
        const R = output[1] || output[0];

        const {pixelData, baseFreq, sampleRate} = this.config;
        if (!pixelData) return true;
        const {width, height, data} = pixelData;
        if (!width || !height) return true;

        const harmonics = Math.min(height, Math.max(1, this.harmonicCount | 0));
        const mode = (this.harmonicMode || 'all').toLowerCase();

        for (let i = 0; i < L.length; i++) {
            let col = Math.floor(this.t / this.samplesPerColumn) % width;
            if (col !== this.lastColumnReported) {
                this.lastColumnReported = col;
                this.port.postMessage({type: "column", column: col});
            }
            const sampleIndex = this.t % this.samplesPerColumn;
            const time = sampleIndex / sampleRate;

            let left = 0;
            let right = 0;

            const envelope = this.computeEnvelope(sampleIndex);
            let usedHarmonics = 0;

            for (let y = 0; y < harmonics; y++) {
                const idx = (y * width + col) * 4;
                const rVal = data[idx] / 255;
                const gVal = data[idx + 1] / 255;
                const bVal = data[idx + 2] / 255;

                const harmonicNumber = y + 1;
                if (mode === 'odd' && harmonicNumber % 2 === 0) continue;
                if (mode === 'even' && harmonicNumber % 2 !== 0) continue;

                // amplitude = vector magnitude
                const baseAmp = Math.sqrt(rVal * rVal + gVal * gVal + bVal * bVal);
                const amp = baseAmp * envelope;
                if (amp < 0.0001) continue;
                usedHarmonics++;

                let freqBase;
                if (mode === 'tonal') {
                    freqBase = this.computeTonalFrequency(y);
                } else {
                    freqBase = baseFreq * harmonicNumber;
                }

                // detune scaled by UI control (0-200%)
                const detuneRange = 0.1 * this.detuneAmount;
                const detuneFactor = 1 + (gVal - 0.5) * detuneRange;
                const freq = freqBase * detuneFactor;

                // phase = red channel maps to [0, 2π]
                const phase = rVal * 2 * Math.PI * this.phaseAmount;

                // oscillator sample
                const s = amp * Math.sin(2 * Math.PI * freq * time + phase);

                // stereo pan scaled by UI control
                const pan = 0.5 + (bVal - 0.5) * this.stereoWidth;
                const lGain = Math.cos(pan * Math.PI / 2);
                const rGain = Math.sin(pan * Math.PI / 2);

                left += s * lGain;
                right += s * rGain;
            }

            // scale down global level
            const divisor = usedHarmonics > 0 ? usedHarmonics : harmonics;
            left = left / divisor;
            right = right / divisor;
            L[i] = left * 0.8;  // louder scaling after normalization
            R[i] = right * 0.8;

            this.t++;
        }

        return true;
    }
}

registerProcessor("rgb-full-synth", RgbFullSynth);
