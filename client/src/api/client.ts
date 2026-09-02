import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// 响应拦截器：统一把错误转成可读的 Error message，方便页面直接 toast
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 仅记录精简错误信息，不打印响应体（避免泄露敏感数据）
    if (error?.code === 'ECONNABORTED') {
      return Promise.reject(new Error('请求超时，请稍后重试'));
    }
    if (!error?.response) {
      return Promise.reject(new Error('网络异常，请检查网络连接'));
    }
    const status = error.response.status;
    const body = error.response.data;
    // 后端统一错误格式：{ error: { message } }
    const message =
      body?.error?.message || body?.message || `请求失败（${status}）`;
    return Promise.reject(new Error(message));
  },
);
