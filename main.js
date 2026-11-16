import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

// DOM 元素綁定
const modelSelect = document.getElementById("modelSelect");
const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const processBtn = document.getElementById("processBtn");
const statusDiv = document.getElementById("status");
const outputHtml = document.getElementById("outputHtml");

let engine = null;
let base64Image = null;
let currentLoadedModel = ""; // 紀錄目前已載入 WebGPU 記憶體的模型

// 處理圖片上傳轉 Base64
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    base64Image = event.target.result;
    
    preview.src = base64Image;
    preview.classList.remove("hidden");
    if (previewPlaceholder) {
      previewPlaceholder.classList.add("hidden");
    }
    
    statusDiv.innerText = `[System] 圖片已載入：${file.name}`;
  };
  reader.readAsDataURL(file);
});

// 執行解析與模型切換流程
processBtn.addEventListener("click", async () => {
  if (!base64Image) {
    statusDiv.innerText = "[Error] 請先上傳圖片檔案！";
    return;
  }

  const selectedModel = modelSelect.value;
  processBtn.disabled = true;
  modelSelect.disabled = true; // 解析期間禁止切換模型選單
  outputHtml.innerHTML = "";
  
  try {
    // 判斷是否需要初始化新引擎，或是切換模型
    if (!engine) {
      statusDiv.innerText = `[WebGPU] 正在初始化引擎並下載 ${selectedModel}，請稍候...`;
      engine = await CreateMLCEngine(selectedModel, {
        initProgressCallback: (progress) => {
          statusDiv.innerText = `[WebGPU] ${progress.text}`;
        }
      });
      currentLoadedModel = selectedModel;
    } else if (currentLoadedModel !== selectedModel) {
      statusDiv.innerText = `[WebGPU] 正在清理記憶體，切換模型至 ${selectedModel}...`;
      // 使用 reload 可以安全地卸載舊模型，避免 WebGPU VRAM 溢出
      await engine.reload(selectedModel, {
        initProgressCallback: (progress) => {
          statusDiv.innerText = `[WebGPU] ${progress.text}`;
        }
      });
      currentLoadedModel = selectedModel;
    }

    statusDiv.innerText = `[WebGPU] ${selectedModel} 已就緒，正在解析文件...`;
    let fullMarkdown = "";

    const messages = [
      {
        role: "user",
        content: [
          { 
            type: "text", 
            text: "你是一個專業的文件排版與 OCR 助理。請提取這張圖片中的所有文字，並使用 Markdown 格式輸出。請完整保留原圖中的標題層級、段落與清單結構；若有表格，請嚴格使用 Markdown Table 呈現。不要輸出任何多餘的解釋或對話，僅輸出解析後的 Markdown 內容。" 
          },
          { 
            type: "image_url", 
            image_url: { url: base64Image } 
          }
        ]
      }
    ];

    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.1, 
    });

    for await (const chunk of chunks) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullMarkdown += content;
      
      if (typeof marked !== 'undefined') {
        outputHtml.innerHTML = marked.parse(fullMarkdown);
      } else {
        outputHtml.innerText = fullMarkdown; 
      }
    }

    statusDiv.innerText = "[System] 解析完成！";

  } catch (error) {
    console.error(error);
    statusDiv.innerText = `[Error] ${error.message}`;
  } finally {
    processBtn.disabled = false;
    modelSelect.disabled = false; // 恢復選單可用狀態
  }
});