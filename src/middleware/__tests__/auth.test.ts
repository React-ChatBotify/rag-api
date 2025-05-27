import { Request, Response, NextFunction } from 'express';
import { apiKeyAuth } from '../auth'; // Adjust path as needed
import { config } from '../../config';

// Mock the config module
jest.mock('../../config', () => ({
    config: {
        ragApiKey: 'test-api-key', // Default configured key for most tests
    },
}));

const mockRequest = (headers: any = {}): Partial<Request> => ({
    header: (name: string) => headers[name],
});

const mockResponse = (): Partial<Response> => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const mockNextFunction = jest.fn();

describe('API Key Authentication Middleware (apiKeyAuth)', () => {

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Restore default ragApiKey for each test if it was changed
        (config as any).ragApiKey = 'test-api-key'; 
    });

    it('should call next() if API key is valid', () => {
        const req = mockRequest({ 'X-API-Key': 'test-api-key' }) as Request;
        const res = mockResponse() as Response;

        apiKeyAuth(req, res, mockNextFunction);

        expect(mockNextFunction).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 401 if API key is missing', () => {
        const req = mockRequest({}) as Request; // No X-API-Key header
        const res = mockResponse() as Response;

        apiKeyAuth(req, res, mockNextFunction);

        expect(mockNextFunction).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized. API key is missing." });
    });

    it('should return 401 if API key is invalid', () => {
        const req = mockRequest({ 'X-API-Key': 'invalid-api-key' }) as Request;
        const res = mockResponse() as Response;

        apiKeyAuth(req, res, mockNextFunction);

        expect(mockNextFunction).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized. API key is invalid." });
    });

    it('should return 500 if RAG API key is not configured on the server (empty string)', () => {
        (config as any).ragApiKey = ''; // Simulate not configured (empty string)
        const req = mockRequest({ 'X-API-Key': 'any-key' }) as Request;
        const res = mockResponse() as Response;

        apiKeyAuth(req, res, mockNextFunction);

        expect(mockNextFunction).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal Server Error. API key for RAG service not configured." });
    });
    
    it('should return 500 if RAG API key is not configured on the server (undefined)', () => {
        (config as any).ragApiKey = undefined; // Simulate not configured (undefined)
        const req = mockRequest({ 'X-API-Key': 'any-key' }) as Request;
        const res = mockResponse() as Response;

        apiKeyAuth(req, res, mockNextFunction);

        expect(mockNextFunction).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal Server Error. API key for RAG service not configured." });
    });
});
