'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Camera } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import axios from 'axios';
import '../globals.css';

export default function ScannerPage() {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<"valid" | "invalid" | null>(null);
  const [error, setError] = useState<string>('');
  const [ticketInfo, setTicketInfo] = useState<null | {
    eventName: string;
    firstName: string;
    lastName: string;
    identityNumber: string;
    email: string;
    orderid: string;
  }>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerStateRef = useRef<'idle' | 'starting' | 'running' | 'stopping'>('idle');
  const scanningWantedRef = useRef<boolean>(false);
  const hasScannedRef = useRef<boolean>(false);
  const startSessionRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopAndClearScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner || scannerStateRef.current === 'stopping') return;

    scannerStateRef.current = 'stopping';

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch (e) {
      console.warn('Failed to stop scanner cleanly', e);
    }

    try {
      scanner.clear();
    } catch (e) {
      console.warn('Failed to clear scanner cleanly', e);
    }

    scannerRef.current = null;
    scannerStateRef.current = 'idle';
    hasScannedRef.current = false;
  };

  const onScanSuccess = async (qrCodeMessage: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    scanningWantedRef.current = false;

    setIsProcessing(true);
    setTicketInfo(null);
    setError('');

    setIsScanning(false);
    await stopAndClearScanner();

    try {
      const response = await axios.post(
        'https://api.casaticketing.ma/api/P6MXWJD9HRJ5VL1MESMU/mobileBarcodeScan',
        { qrcode: qrCodeMessage },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      if (response.status === 200) {
        console.log('API 200 Response:', response.data);
      }
      const ticket = response.data?.ticket;
      if (
        response.data &&
        response.data.status === 'success' &&
        ticket &&
        typeof ticket === 'object' &&
        Object.keys(ticket).length > 0
      ) {
        setValidationResult('valid');
        setTicketInfo(ticket);
      } else {
        setValidationResult('invalid');
        setError('Ticket not found.');
      }
    } catch {
      setValidationResult('invalid');
      setError('API error. Ticket not found.');
    }
    setIsProcessing(false);
  };

  const onScanError = (_errorMessage: string) => {
    void _errorMessage;
  };

  const startScanning = () => {
    if (scannerStateRef.current !== 'idle') return;

    scanningWantedRef.current = true;
    hasScannedRef.current = false;
    setError('');
    setValidationResult(null);
    setIsScanning(true);
  };

  useEffect(() => {
    if (!isScanning || !scanningWantedRef.current || scannerStateRef.current !== 'idle') return;

    const currentSession = startSessionRef.current + 1;
    startSessionRef.current = currentSession;

    const timer = setTimeout(() => {
      void (async () => {
      const element = document.getElementById('qr-reader');
      if (!element) {
        console.error('QR reader element not found');
        setError('Scanner initialization failed');
        setIsScanning(false);
        scanningWantedRef.current = false;
        return;
      }

      const html5QrCode = new Html5Qrcode('qr-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const scanConfig = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };
      scannerStateRef.current = 'starting';

      try {
        await html5QrCode.start(
          { facingMode: { exact: 'environment' } },
          scanConfig,
          (decodedText) => void onScanSuccess(decodedText),
          (errMsg) => onScanError(errMsg)
        );

        if (
          !mountedRef.current ||
          !scanningWantedRef.current ||
          startSessionRef.current !== currentSession
        ) {
          await stopAndClearScanner();
          return;
        }

        scannerStateRef.current = 'running';
      } catch (err) {
        console.error('Failed to start scanner', err);
        scannerRef.current = null;
        scannerStateRef.current = 'idle';

        const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
        const isInsecure =
          typeof window !== 'undefined' &&
          !window.isSecureContext &&
          window.location.hostname !== 'localhost' &&
          window.location.hostname !== '127.0.0.1';
        const isBackCameraMissing =
          message.includes('OverconstrainedError') ||
          message.includes('Requested device not found');

        setError(
          isInsecure
            ? 'Camera access requires HTTPS or localhost.'
            : isBackCameraMissing
            ? 'Back camera not found on this device/browser.'
            : `Unable to access camera: ${message}`
        );
        setIsScanning(false);
        scanningWantedRef.current = false;
      }
      })();
    }, 100);

    return () => {
      clearTimeout(timer);
    };
    // onScanSuccess is intentionally stable for scanner callbacks in this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const stopScanning = async () => {
    scanningWantedRef.current = false;
    setIsScanning(false);
    await stopAndClearScanner();
  };

  const resetScanner = async () => {
    await stopScanning();
    setValidationResult(null);
    setError('');
  };

  useEffect(() => {
    return () => {
      void stopAndClearScanner();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-100 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-2xl shadow-2xl bg-white/90 backdrop-blur-md flex flex-col items-center p-4 sm:p-6 md:p-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent text-center mb-4">QR Ticket Scanner</h1>
        
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-[280px] aspect-square flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-xl mb-4 bg-blue-50/60">
            {!isScanning && !isProcessing && !validationResult && (
              <Camera className="w-12 h-12 sm:w-16 sm:h-16 text-blue-400 mb-4" />
            )}
            {isScanning && (
              <div id="qr-reader" className="w-full h-full" />
            )}
            {isProcessing && (
              <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            )}
            {validationResult && (
              validationResult === 'valid' ? (
                <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-green-500 mb-4" />
              ) : (
                <XCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mb-4" />
              )
            )}
          </div>
          {!isScanning && !isProcessing && !validationResult && (
            <Button
              onClick={startScanning}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold py-2.5 sm:py-3 rounded-xl text-base sm:text-lg shadow-md transition-all duration-200"
            >
              Start Camera Scan
            </Button>
          )}
          {isScanning && (
            <Button
              onClick={stopScanning}
              variant="outline"
              className="w-full mt-2 bg-white/90 backdrop-blur-sm hover:bg-white text-blue-600 border-blue-200 font-semibold py-2.5 sm:py-3 rounded-xl text-base sm:text-lg shadow-md transition-all duration-200"
            >
              Stop Scanning
            </Button>
          )}
          {isProcessing && (
            <p className="text-sm text-gray-600 mt-2">Validating ticket...</p>
          )}
          {validationResult && (
            <div className="w-full mt-4">
              {validationResult === 'valid' ? (
                <Alert className="border-green-200 bg-green-50/80 backdrop-blur-sm">
                  <AlertDescription className="text-green-800 font-medium text-center">✅ Ticket Valid</AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-red-200 bg-red-50/80 backdrop-blur-sm">
                  <AlertDescription className="text-red-800 font-medium text-center">❌ Ticket Invalid</AlertDescription>
                </Alert>
              )}
              <Button
                onClick={resetScanner}
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold py-2.5 sm:py-3 rounded-xl text-base sm:text-lg shadow-md transition-all duration-200"
              >
                Scan Another Ticket
              </Button>
            </div>
          )}
          {error && (
            <Alert className="border-yellow-200 bg-yellow-50/80 backdrop-blur-sm mt-4">
              <AlertDescription className="text-yellow-800 font-medium text-center">{error}</AlertDescription>
            </Alert>
          )}
          {validationResult && ticketInfo && (
            <div className="w-full mt-4 bg-blue-50/90 rounded-2xl p-4 sm:p-6 border border-blue-200 shadow-md text-left flex flex-col gap-3 sm:gap-4">
              <h3 className="text-lg sm:text-xl font-bold text-blue-700 mb-1 sm:mb-2 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" /> Ticket Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-2 text-sm sm:text-base text-blue-900">
                <div><span className="font-semibold">Event:</span> <span className="break-words">{ticketInfo.eventName}</span></div>
                <div><span className="font-semibold">Name:</span> <span className="break-words">{ticketInfo.firstName} {ticketInfo.lastName}</span></div>
                <div><span className="font-semibold">ID Number:</span> <span className="break-words">{ticketInfo.identityNumber}</span></div>
                <div><span className="font-semibold">Email:</span> <span className="break-words">{ticketInfo.email}</span></div>
                <div><span className="font-semibold">Order ID:</span> <span className="break-words">{ticketInfo.orderid}</span></div>
              </div>
            </div>
          )}
        </div>
        <p className="mt-6 sm:mt-8 text-gray-400 text-center text-sm sm:text-base">
          This scanner validates tickets by sending QR code data to your validation API. Make sure camera permissions are enabled for best results.
        </p>
      </Card>
    </div>
  );
} 