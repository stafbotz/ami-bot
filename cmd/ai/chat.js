import Groq from "groq-sdk";
import OpenAI from "openai";
import setting from "../../setting.js";
import {
  readUserContext,
  writeUserContext,
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting } from "../../system/function.js";

// Inisialisasi API
const groq = new Groq({ apiKey: setting.groqApiKey });
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey:
    "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",
});

// Add these imports at the top of your file
import { createCanvas, Image } from "canvas";
import MathJax from "mathjax-node";
import fs from "fs";
import path from "path";

// Initialize the temporary directory for images
const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Function to convert SVG string to PNG/JPG buffer
async function convertSvgToImage(svgString, width, height, format = 'png') {
  try {
    console.log(`Converting SVG to ${format} image (${width}x${height})`);
    
    // Create a canvas with the specified dimensions
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // For a clean background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    
    // Load the SVG data using a data URL
    const img = new Image();
    
    // Create a promise to handle the async image loading
    return new Promise((resolve, reject) => {
      // Set up image load handler
      img.onload = () => {
        try {
          // Draw the image onto the canvas
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to buffer
          const buffer = format.toLowerCase() === 'jpg' || format.toLowerCase() === 'jpeg'
            ? canvas.toBuffer('image/jpeg')
            : canvas.toBuffer('image/png');
          
          console.log(`SVG successfully converted to ${format}`);
          resolve(buffer);
        } catch (err) {
          console.error('Error drawing SVG to canvas:', err);
          reject(err);
        }
      };
      
      // Set up error handler
      img.onerror = (err) => {
        console.error('Error loading SVG image:', err);
        reject(new Error('Failed to load SVG image'));
      };
      
      // Create a data URL from the SVG string
      const svgBase64 = Buffer.from(svgString).toString('base64');
      img.src = `data:image/svg+xml;base64,${svgBase64}`;
    });
  } catch (error) {
    console.error('Error in SVG to image conversion:', error);
    throw error;
  }
}

// Enhanced function to convert MathJax SVG output to PNG/JPG
async function convertMathJaxToImage(latex, width = 800, height = 200, format = 'png') {
  try {
    console.log(`Converting LaTeX to ${format} image: ${latex}`);
    
    // Generate SVG from LaTeX using MathJax
    const result = await MathJax.typeset({
      math: latex,
      format: 'TeX',
      svg: true,
    });
    
    if (!result || !result.svg) {
      throw new Error('MathJax did not return valid SVG');
    }
    
    // Get SVG dimensions from the viewBox
    const viewBoxMatch = result.svg.match(/viewBox=["']([^"']*)["']/);
    let svgWidth, svgHeight;
    
    if (viewBoxMatch && viewBoxMatch[1]) {
      const [, , w, h] = viewBoxMatch[1].split(' ').map(Number);
      svgWidth = w;
      svgHeight = h;
      
      // Adjust canvas dimensions to maintain aspect ratio
      if (svgWidth && svgHeight) {
        const aspectRatio = svgWidth / svgHeight;
        height = width / aspectRatio;
      }
    }
    
    // Convert SVG to image
    const imageBuffer = await convertSvgToImage(result.svg, width, height, format);
    
    // Save to temporary file
    const tempFilename = `math_${Date.now()}.${format.toLowerCase()}`;
    const outputPath = path.join(tempDir, tempFilename);
    fs.writeFileSync(outputPath, imageBuffer);
    
    console.log(`Math image saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating math image:', error);
    return null;
  }
}

// Enhanced function to detect mathematical content
function detectMathContent(text) {
  // Regular expressions to identify LaTeX expressions and mathematical notation
  const patterns = [
    // LaTeX delimiters
    /\\\((.*?)\\\)/s,  // \(...\)
    /\\\[(.*?)\\\]/s,  // \[...\]
    /\$(.*?)\$/s,      // $...$
    /\$\$(.*?)\$\$/s,  // $$...$$
    
    // LaTeX environments
    /\\begin\{(equation|align|matrix|bmatrix|pmatrix|cases|gather|array).*?\}/s,
    /\\end\{(equation|align|matrix|bmatrix|pmatrix|cases|gather|array).*?\}/s,
    
    // Common LaTeX commands
    /\\frac\{/s,       // Fractions
    /\\dfrac\{/s,      // Display fractions
    /\\sqrt\{/s,       // Square roots
    /\\sum/s,          // Summations
    /\\prod/s,         // Products
    /\\int/s,          // Integrals
    /\\lim/s,          // Limits
    /\\inf/s,          // Infinity
    /\\partial/s,      // Partial derivatives
    /\\nabla/s,        // Nabla
    /\\hat\{/s,        // Hat
    /\\bar\{/s,        // Bar
    /\\vec\{/s,        // Vector
    /\\mathbf\{/s,     // Bold math
    /\\math(rm|sf|tt|it|cal|bb)\{/s, // Math text styles
    
    // Mathematical symbols
    /[=<>≤≥≈≠∑∫∂√π∞±×÷]/s,
    
    // Common math functions
    /\\(sin|cos|tan|cot|sec|csc|log|ln|exp|lim|sup|inf|min|max|det|arg|gcd|lcm)/s,
    
    // Our special tags
    /\[MATH_IMAGE:/s,   // Our special math image tag
    /\[GRAPH:/s,        // Graph tag
    /\[SOLUTION_GRAPH:/s, // Solution graph tag
    
    // Matrix notation
    /\\begin\{(matrix|bmatrix|pmatrix|vmatrix|Vmatrix)/s,
    
    // Common physics notation
    /\\(ket|bra|braket)\{/s,
    
    // Subscripts and superscripts with complex content
    /\_\{[^\}]+\}/s,    // Complex subscripts
    /\^\{[^\}]+\}/s,    // Complex superscripts
    
    // Aligned equations
    /\\begin\{align/s,
    
    // Common in calculus
    /\\(lim|int|sum|prod)\_\{/s,
    
    // Greek letters (common in math)
    /\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)/s,
    
    // Additional check for expressions that look mathematical
    /\b[a-z]_[a-z0-9]\b/is,  // Subscripts like x_1
    /\b[a-z]\^[a-z0-9]\b/is, // Superscripts like x^2
  ];
  
  // Check if any pattern matches
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  // Check for sequences that look like equations
  // This helps catch things like "2x + 3y = 5" that don't use LaTeX but are mathematical
  const equationLikePatterns = [
    // Simple algebraic equations
    /[a-z]\s*[+\-*\/]\s*[a-z0-9].*?=/is,
    
    // Multiple variables with operations
    /[a-z][0-9]*\s*[+\-*\/]\s*[a-z][0-9]*/is,
    
    // Functions with arguments
    /[a-z]\([a-z](,\s*[a-z])*\)/is,
    
    // Multiple equal signs in a paragraph (likely equations)
    /=.*?=.*?=/s,
  ];
  
  // Split text into paragraphs and check each
  const paragraphs = text.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    for (const pattern of equationLikePatterns) {
      if (pattern.test(paragraph)) {
        return true;
      }
    }
    
    // Check for high density of mathematical symbols in a paragraph
    const mathSymbolCount = (paragraph.match(/[+\-*\/=<>^_{}()\[\]]/g) || []).length;
    const paragraphLength = paragraph.length;
    
    if (paragraphLength > 20 && (mathSymbolCount / paragraphLength) > 0.15) {
      // If more than 15% of characters are math symbols, likely mathematical content
      return true;
    }
  }
  
  return false;
}

// Function to simplify LaTeX notation for fallback text responses
async function simplifyLatexNotation(text) {
  // Replace common LaTeX patterns with simplified text versions
  let simplified = text;
  
  // Replace inline LaTeX
  simplified = simplified.replace(/\\\((.*?)\\\)/g, '「$1」');
  
  // Replace display LaTeX
  simplified = simplified.replace(/\\\[(.*?)\\\]/g, '\n「$1」\n');
  
  // Replace dollar notation
  simplified = simplified.replace(/\$(.*?)\$/g, '「$1」');
  simplified = simplified.replace(/\$\$(.*?)\$\$/g, '\n「$1」\n');
  
  // Replace common LaTeX commands
  simplified = simplified.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  simplified = simplified.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
  simplified = simplified.replace(/\^(\d+|{[^{}]*})/g, '^$1');
  simplified = simplified.replace(/\_(\d+|{[^{}]*})/g, '_$1');
  simplified = simplified.replace(/\\text\{([^{}]*)\}/g, '$1');
  simplified = simplified.replace(/\\mathrm\{([^{}]*)\}/g, '$1');
  
  // Replace common mathematical environments
  simplified = simplified.replace(/\\begin\{([^{}]*)\}(.*?)\\end\{\1\}/gs, 
    (match, env, content) => {
      return `\n【${env}】\n${content.trim()}\n【/${env}】\n`;
    }
  );
  
  return simplified;
}

// Helper function to parse text into sections of plain text and LaTeX
function parseTextAndLatex(text) {
  const sections = [];
  
  // LaTeX patterns with their start/end delimiters
  const latexPatterns = [
    // Standard LaTeX delimiters
    { start: "\\(", end: "\\)", type: "inline" },
    { start: "\\[", end: "\\]", type: "display" },
    { start: "$", end: "$", type: "inline", 
      validator: (pos, text) => {
        // Validate that this is actually a math delimiter, not a currency symbol
        // Check if preceded by a space, start of string, or non-word character
        const prevChar = pos > 0 ? text[pos-1] : ' ';
        const nextChar = pos < text.length-1 ? text[pos+1] : ' ';
        
        if (/\s/.test(prevChar) || /[^\w]/.test(prevChar) || pos === 0) {
          // Check if followed by a letter/number/symbol typical in math
          if (/[a-zA-Z0-9\-+=(]/.test(nextChar)) {
            return true;
          }
        }
        return false;
      }
    },
    { start: "$$", end: "$$", type: "display" },
    
    // LaTeX environments
    { 
      start: "\\begin{equation}", 
      end: "\\end{equation}", 
      type: "environment" 
    },
    { 
      start: "\\begin{align", 
      end: "\\end{align", 
      type: "environment",
      // Special handling for align/align* environments
      validator: (pos, text) => {
        // Get the full environment start tag (could be align, align*, etc.)
        const match = text.substring(pos).match(/\\begin\{(align\*?)\}/);
        if (match) {
          // Update the end pattern to match the exact environment
          return {
            newEnd: `\\end{${match[1]}}`
          };
        }
        return true;
      }
    },
    {
      start: "\\begin{", 
      end: "\\end{", 
      type: "environment",
      // Special handling for other environments
      validator: (pos, text) => {
        // Get the environment name
        const match = text.substring(pos).match(/\\begin\{([a-zA-Z]+\*?)\}/);
        if (match) {
          const envName = match[1];
          // Only process common math environments
          if (['matrix', 'bmatrix', 'pmatrix', 'vmatrix', 'cases', 'gather', 'array'].includes(envName.replace('*',''))) {
            // Update the end pattern to match the exact environment
            return {
              newEnd: `\\end{${envName}}`
            };
          }
          return false; // Not a math environment we want to process
        }
        return false;
      }
    },
    
    // Custom tags
    { start: "[MATH_IMAGE:", end: "]", type: "custom" },
    { start: "[GRAPH:", end: "]", type: "custom" },
    { start: "[SOLUTION_GRAPH:", end: "]", type: "custom" }
  ];
  
  // Current position in text
  let currentPos = 0;
  
  while (currentPos < text.length) {
    // Find the next LaTeX pattern
    let nextLatexPos = text.length;
    let matchingPattern = null;
    let patternConfig = null;
    
    for (const pattern of latexPatterns) {
      const startPos = text.indexOf(pattern.start, currentPos);
      if (startPos !== -1 && startPos < nextLatexPos) {
        // If this pattern has a validator, check it
        if (pattern.validator) {
          const validationResult = pattern.validator(startPos, text);
          if (validationResult === false) {
            continue; // Skip this match
          }
          
          // If validator returned config options, store them
          if (typeof validationResult === 'object') {
            patternConfig = validationResult;
          }
        }
        
        nextLatexPos = startPos;
        matchingPattern = pattern;
      }
    }
    
    // Add text before the LaTeX
    if (nextLatexPos > currentPos) {
      const textContent = text.substring(currentPos, nextLatexPos);
      sections.push({ 
        type: "text", 
        content: textContent,
        endsWithParagraph: textContent.includes("\n\n")
      });
    }
    
    // If we found LaTeX content
    if (matchingPattern) {
      const startPos = nextLatexPos;
      const startDelimLength = matchingPattern.start.length;
      
      // Determine end delimiter (might be adjusted by validator)
      let endDelimiter = matchingPattern.end;
      if (patternConfig && patternConfig.newEnd) {
        endDelimiter = patternConfig.newEnd;
      }
      
      // Find the end of this LaTeX section
      let endPos = text.indexOf(endDelimiter, startPos + startDelimLength);
      
      // Handle special case for environments where we need to match the name
      if (matchingPattern.type === "environment" && endDelimiter === "\\end{") {
        // Find the closing bracket of the begin tag
        const beginClosePos = text.indexOf("}", startPos + startDelimLength);
        if (beginClosePos !== -1) {
          // Extract environment name
          const envName = text.substring(startPos + startDelimLength, beginClosePos);
          // Find the matching end tag
          endPos = text.indexOf(`\\end{${envName}}`, beginClosePos);
          if (endPos !== -1) {
            endDelimiter = `\\end{${envName}}`;
          }
        }
      }
      
      if (endPos !== -1) {
        // For environments, include the full begin/end tags
        let latexContent;
        if (matchingPattern.type === "environment") {
          latexContent = text.substring(startPos, endPos + endDelimiter.length);
        } else {
          latexContent = text.substring(startPos + startDelimLength, endPos);
        }
        
        sections.push({ 
          type: "latex", 
          content: latexContent,
          latexType: matchingPattern.type,
          endsWithParagraph: false
        });
        
        // Move past this LaTeX content
        currentPos = endPos + endDelimiter.length;
      } else {
        // If no end delimiter found, treat the rest as text
        sections.push({ 
          type: "text", 
          content: text.substring(startPos),
          endsWithParagraph: text.endsWith("\n\n")
        });
        currentPos = text.length;
      }
    } else {
      // No more LaTeX found
      currentPos = text.length;
    }
  }
  
  return sections;
}

// Helper function to perform text word wrapping
function wordWrap(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = text.split(/\n\s*\n/); // Split on paragraph breaks
  
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Add an empty line between paragraphs (except after the last paragraph)
    if (paragraphs.indexOf(paragraph) < paragraphs.length - 1) {
      lines.push('');
    }
  }
  
  return lines;
}

// Enhanced function to draw better-looking graph paper
function drawEnhancedGraphPaper(ctx, width, height, gridSize) {
  // Fill with a soft cream/yellow background for an "old paper" look
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#FFFEF0");   // Lightest at top
  gradient.addColorStop(1, "#FFF8E8");   // Slightly darker at bottom
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add subtle paper texture
  ctx.save();
  ctx.globalAlpha = 0.03;
  // Simulating paper texture with random noise
  for (let i = 0; i < width; i += 4) {
    for (let j = 0; j < height; j += 4) {
      if (Math.random() > 0.5) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(i, j, 2, 2);
      }
    }
  }
  ctx.restore();
  
  // Draw main grid lines (lighter)
  ctx.strokeStyle = "#D8D8D8";
  ctx.lineWidth = 0.8;

  // Horizontal grid lines
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Vertical grid lines
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Draw stronger grid lines every 5 cells for better readability
  ctx.strokeStyle = "#B8B8B8";
  ctx.lineWidth = 1.2;

  // Stronger horizontal lines
  for (let y = 0; y <= height; y += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Stronger vertical lines
  for (let x = 0; x <= width; x += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Add a decorative header/title area
  ctx.fillStyle = "#F8F5E6";
  ctx.fillRect(0, 0, width, 80);
  
  // Add subtle shadow under the header
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.fillRect(0, 80, width, 5);
  
  // Draw header border
  ctx.strokeStyle = "#A0A0A0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 80);
  ctx.lineTo(width, 80);
  ctx.stroke();

  // Add title with shadow effect
  ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  ctx.fillStyle = "#404040";
  ctx.font = "bold 30px 'Arial', sans-serif";
  ctx.fillText("Ami DeepThinking", 30, 45);
  
  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Add subtitle
  ctx.font = "italic 16px 'Arial', sans-serif";
  ctx.fillStyle = "#606060";
  ctx.fillText("Solusi Matematika", 32, 70);
  
  // Add date on the right
  const currentDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  });
  ctx.font = "16px 'Arial', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(currentDate, width - 30, 45);
  
  // Reset text alignment
  ctx.textAlign = "left";
  
  // Add a small watermark
  ctx.font = "12px 'Arial', sans-serif";
  ctx.fillStyle = "#A0A0A0";
  ctx.textAlign = "right";
  ctx.fillText("Powered by Renshu Mushy", width - 30, height - 20);
  ctx.textAlign = "left";
  
  // Add page number style element at bottom
  ctx.strokeStyle = "#C0C0C0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width/2 - 50, height - 40);
  ctx.lineTo(width/2 + 50, height - 40);
  ctx.stroke();
  
  ctx.font = "14px 'Arial', sans-serif";
  ctx.fillStyle = "#808080";
  ctx.textAlign = "center";
  ctx.fillText("1", width/2, height - 20);
  ctx.textAlign = "left";
}

// Improved renderTextWithLaTeX function that renders actual LaTeX content
async function renderTextWithLaTeX(ctx, text, gridSize, width, height) {
  // Set text style for handwritten look
  ctx.font = "22px 'Comic Sans MS', cursive";
  ctx.fillStyle = "#000080"; // Dark blue color for text
  
  // Parse text to identify LaTeX and regular text sections
  const sections = parseTextAndLatex(text);
  
  // Initialize cursor position
  let x = gridSize * 2;
  let y = gridSize * 4 + 60; // Start below the header
  const lineHeight = gridSize * 1.5;
  const maxWidth = width - gridSize * 4;
  
  // For each section, either render as text or as LaTeX
  for (const section of sections) {
    if (section.type === "text") {
      // Word wrap for regular text
      const lines = wordWrap(ctx, section.content, maxWidth);
      
      for (const line of lines) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        
        // Check if we need a new page (simple overflow handling)
        if (y > height - gridSize * 2) {
          console.log("Warning: Content overflows the canvas height");
          // In a full implementation, you would create a new page here
          break;
        }
      }
      
      // Add extra spacing after paragraphs
      if (section.endsWithParagraph) {
        y += lineHeight * 0.5;
      }
    } 
    else if (section.type === "latex") {
      try {
        // For LaTeX, we'll render it as an image and draw on canvas
        // Generate SVG for the LaTeX expression
        const result = await MathJax.typeset({
          math: section.content,
          format: "TeX",
          svg: true,
        });
        
        if (result && result.svg) {
          // Extract dimensions from SVG
          const viewBoxMatch = result.svg.match(/viewBox=["']([^"']*)["']/);
          let svgWidth = 400; // Default width
          let svgHeight = 100; // Default height
          
          if (viewBoxMatch && viewBoxMatch[1]) {
            const [, , w, h] = viewBoxMatch[1].split(' ').map(Number);
            svgWidth = w;
            svgHeight = h;
          }
          
          // Calculate scaled dimensions to fit our canvas
          const scale = Math.min(maxWidth / svgWidth, lineHeight * 2 / svgHeight);
          const renderWidth = svgWidth * scale;
          const renderHeight = svgHeight * scale;
          
          // Create a temporary image from the SVG
          const imageBuffer = await convertSvgToImage(result.svg, renderWidth, renderHeight);
          const tempFile = path.join(tempDir, `temp_latex_${Date.now()}.png`);
          fs.writeFileSync(tempFile, imageBuffer);
          
          // Load the image and draw it on the canvas
          const img = new Image();
          img.src = tempFile;
          
          // Highlight area for math content
          ctx.save();
          ctx.fillStyle = "#F8F8FF"; // Very light background for math
          ctx.fillRect(x, y - renderHeight + 5, renderWidth, renderHeight);
          ctx.restore();
          
          // Draw the LaTeX image
          ctx.drawImage(img, x, y - renderHeight + lineHeight/2, renderWidth, renderHeight);
          
          // Clean up temporary file
          fs.unlinkSync(tempFile);
          
          // Move cursor down
          y += lineHeight * 1.2;
        }
      } catch (error) {
        console.error("Error rendering LaTeX:", error);
        // Fallback: display LaTeX as plain text
        ctx.fillStyle = "#800000"; // Dark red for LaTeX errors
        ctx.fillText(`[Formula: ${section.content.substring(0, 40)}...]`, x, y);
        y += lineHeight;
      }
    }
  }
}

// Improved function to render entire response with LaTeX on graph paper
async function renderResponseOnGraphPaper(responseText) {
  console.log("Rendering full response on graph paper");
  const width = 1200;  // Larger width for better readability
  const height = 1600; // Taller height to accommodate more content
  const format = 'png'; // Use PNG for better quality

  try {
    // Create canvas for graph paper
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    console.log("Creating graph paper with text and LaTeX content");
    
    // Draw background and grid
    const gridSize = 20;
    drawEnhancedGraphPaper(ctx, width, height, gridSize);
    
    // Render text and LaTeX content
    await renderTextWithLaTeX(ctx, responseText, gridSize, width, height);
    
    // Convert to buffer and save
    const buffer = format.toLowerCase() === 'jpg' || format.toLowerCase() === 'jpeg'
      ? canvas.toBuffer('image/jpeg', { quality: 0.95 })
      : canvas.toBuffer('image/png');
    
    // Save to temporary file
    const filename = `answer_${Date.now()}.${format}`;
    const outputPath = path.join(tempDir, filename);
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`Response rendered and saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("Error rendering response on graph paper:", error);
    return null;
  }
}

// Function to generate math images from LaTeX
// Improved generateMathImage with better logging
async function generateMathImage(latex, filename) {
  try {
    console.log(`Generating math image for LaTeX: ${latex}`);

    // Configure MathJax
    const result = await MathJax.typeset({
      math: latex,
      format: "TeX",
      svg: true,
    });

    if (!result || !result.svg) {
      console.error("MathJax did not return valid SVG");
      return null;
    }

    // Save SVG to a file
    const outputPath = path.join(tempDir, `${filename}.svg`);
    fs.writeFileSync(outputPath, result.svg);
    console.log(`Math image saved to ${outputPath}`);

    return outputPath;
  } catch (error) {
    console.error("Error generating math image:", error);
    return null;
  }
}

// Improved generateGraphPaperSolution with better logging
async function generateGraphPaperSolution(
  drawFunction,
  width = 800,
  height = 800
) {
  try {
    console.log("Creating canvas for graph paper solution");
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Draw graph paper background
    console.log("Drawing graph paper background");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    console.log("Drawing grid lines");
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;

    const gridSize = 20;
    for (let i = 0; i <= width; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }

    for (let i = 0; i <= height; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Draw axes
    console.log("Drawing axes");
    ctx.strokeStyle = "#a0a0a0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Execute the provided draw function
    console.log("Executing custom drawing function");
    if (typeof drawFunction === "function") {
      try {
        drawFunction(ctx, width, height, gridSize);
        console.log("Custom drawing function executed successfully");
      } catch (drawError) {
        console.error("Error in custom drawing function:", drawError);
      }
    } else {
      console.error("Invalid drawing function provided");
    }

    // Save canvas to file
    console.log("Saving canvas to image file");
    const filename = `graph_${Date.now()}.png`;
    const outputPath = path.join(tempDir, filename);

    try {
      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(outputPath, buffer);
      console.log(`Graph image saved to ${outputPath}`);
      return outputPath;
    } catch (saveError) {
      console.error("Error saving canvas to file:", saveError);
      return null;
    }
  } catch (error) {
    console.error("Error generating graph paper solution:", error);
    return null;
  }
}

// Simpan sesi aktif AI
const activeSessions = new Map();

// Waktu timeout sesi (3 menit dalam milidetik)
const SESSION_TIMEOUT = 3 * 60 * 1000;

// Model AI yang tersedia
const AI_MODELS = {
  flash: "Ami Flash - General instant answers",
  reasoning: "Ami Reasoning - Untuk penalaran (70B)",
  deepthinking: "Ami DeepThinking - Untuk pemikiran mendalam (671B)",
};

// Daftar fitur
const getFeaturesList = (cmds) => {
  const commandGroups = {};
  const tagEmojis = {
    main: "📜",
    convert: "🔄",
    ai: "🤖",
    downloader: "📥",
    group: "👥",
    channel: "📣",
    owner: "🛠",
    tools: "🛠",
    anime: "🍥",
    lainnya: "📌",
  };

  for (const [command, details] of cmds) {
    const tag = details.tags || "lainnya";
    if (!commandGroups[tag]) commandGroups[tag] = [];
    const commandText = `*.${command}* - ${details.desc}`;
    if (!commandGroups[tag].includes(commandText)) {
      commandGroups[tag].push(commandText);
    }
  }

  let features = "Berikut adalah fitur yang tersedia:\n\n";
  for (const [tag, commands] of Object.entries(commandGroups)) {
    const emoji = tagEmojis[tag] || tagEmojis["lainnya"];
    features += `${emoji} *${tag.toUpperCase()}*\n`;
    features += commands.map((cmd) => ` │๑ ${cmd}`).join("\n");
    features += "\n\n";
  }

  return features.trim();
};

// Fungsi untuk format konten thinking
function formatThinkContent(text) {
  return text
    .split("\n\n")
    .map((paragraph) => `> ${paragraph.trim()}`)
    .join("\n\n");
}

// Fungsi manajemen sesi
function createSession(userId, db, sock, chatId) {
  const session = {
    active: true,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    modelSelected: false,
    modelType: null,
    showThinking: false, // Default: tidak menampilkan thinking
    timeout: null,
  };

  // Set timeout
  session.timeout = setTimeout(() => {
    endSession(userId, sock, chatId);
  }, SESSION_TIMEOUT);

  // Save session
  activeSessions.set(userId, session);

  // Record in database
  if (db && db.users && db.users[userId]) {
    db.users[userId].aiChatActive = true;
  }

  return session;
}

function updateSession(db, userId, sock, chatId) {
  const session = activeSessions.get(userId);
  if (session) {
    session.lastActivity = Date.now();
    clearTimeout(session.timeout);
    session.timeout = setTimeout(() => {
      endSession(db, userId, sock, chatId);
    }, SESSION_TIMEOUT);
    return true;
  }
  return false;
}

// Fix 3: Improved endSession function
function endSession(db, userId, sock, chatId, reason = "timeout") {
  const session = activeSessions.get(userId);
  if (session) {
    clearTimeout(session.timeout);
    activeSessions.delete(userId);

    // Update database
    if (db && db.users && db.users[userId]) {
      db.users[userId].aiChatActive = false;
    }

    // Notify user with appropriate message based on reason
    if (sock && chatId) {
      let message = "";

      if (reason === "timeout") {
        message =
          "⏰ Sesi chat dengan Ami telah berakhir karena tidak ada aktivitas selama 3 menit. Ketik *ami* untuk memulai sesi baru dan pilih model.";
      } else if (reason === "manual") {
        message =
          "✅ Sesi chat dengan Ami telah berakhir. Semoga jawabanku membantu! Ketik *ami* untuk memulai sesi baru kapan saja.";
      }

      if (message) {
        sock.sendMessage(chatId, { text: message });
      }
    }

    return true;
  }
  return false;
}

function getSession(userId) {
  return activeSessions.get(userId);
}

// Fungsi untuk membangun history relevan yang disempurnakan
function buildRelevantHistory(userContext, quotedId) {
  const allHistory = userContext.history || [];
  let relevantHistory = [];

  // Jika ada pesan yang di-quote, temukan pesan tersebut dan konteksnya
  if (quotedId) {
    // Cari pesan yang di-quote
    const quotedIndex = allHistory.findIndex((msg) => msg.id === quotedId);

    if (quotedIndex !== -1) {
      // Ambil pesan yang di-quote beserta beberapa pesan sebelumnya untuk konteks
      // dan beberapa pesan setelahnya jika ada
      const startIndex = Math.max(0, quotedIndex - 2); // 2 pesan sebelum quoted
      const endIndex = Math.min(allHistory.length, quotedIndex + 3); // 3 pesan setelah quoted

      // Tambahkan range pesan tersebut ke relevantHistory
      relevantHistory = allHistory.slice(startIndex, endIndex);
    }
  }

  // Jika tidak ada quoted message atau tidak ditemukan, gunakan pesan-pesan terbaru
  if (relevantHistory.length === 0) {
    // Ambil maksimal 10 pesan terakhir untuk konteks
    relevantHistory = allHistory.slice(-10);
  } else {
    // Jika sudah ada pesan dari quoted, tambahkan beberapa pesan terbaru jika belum ada
    const latestMsgs = allHistory.slice(-5);
    const existingIds = new Set(relevantHistory.map((msg) => msg.id));

    // Tambahkan pesan terbaru yang belum ada di relevantHistory
    latestMsgs.forEach((msg) => {
      if (!existingIds.has(msg.id)) {
        relevantHistory.push(msg);
      }
    });
  }

  // Urutkan pesan berdasarkan urutan kronologis
  relevantHistory.sort((a, b) => {
    const idA = a.id.split("_").pop();
    const idB = b.id.split("_").pop();
    return parseInt(idA) - parseInt(idB);
  });

  // Batasi jumlah maksimum pesan untuk menghindari token terlalu banyak
  if (relevantHistory.length > 15) {
    relevantHistory = relevantHistory.slice(-15);
  }

  return relevantHistory;
}

// Enhanced persona function with improved prompts and instructions
function createPersona(
  modelType,
  user,
  currentDate,
  currentTime,
  greeting,
  cmds
) {
  // Enhanced common persona shared across all models
  const commonPersona = `
# USER INFORMATION:
- Name: ${user.name || "User"}
- Birth date: ${user.birth || "Unknown"}

# TIME & GREETING:
- Current time: ${currentTime} 
- Date: ${currentDate}
- Time greeting: ${greeting}

# FEATURES LIST:
${getFeaturesList(cmds)}

# IDENTITY & CONTEXT:
1. You are Ami, an advanced AI assistant created by the *Renshu Mushy team*.
2. When asked about your creator, always emphasize you were developed by the *Renshu Mushy team* - never mention any other companies or developers.
3. You have NO connection to any other AI models, companies, or research labs.
4. You must maintain conversation continuity by carefully tracking previous messages.
5. Remember details users share and refer back to them appropriately.

# LANGUAGE & TONE:
1. *IMPORTANT*: Always respond in the same language the user is using. If they speak in Indonesian, you must reply in Indonesian. Default to Indonesian for most conversations.
2. Use at most 2 emoji in each response - place them thoughtfully, not randomly.
3. Maintain a friendly, helpful, and conversational tone throughout.
4. Be patient and supportive, especially with complex questions.
5. Use natural, flowing language that sounds like a helpful friend.

# WHATSAPP FORMATTING RULES:
- Use *asterisks* for *bold text* - never use **double asterisks**
- Use _underscores_ for _italic text_ - never use __double underscores__
- Use ~tildes~ for ~strikethrough~
- Use \`backticks\` for \`monospace\`
- Use \`\`\`triple backticks\`\`\` for code blocks
- For lists, use:
  * asterisk and space
  - or dash and space
  1. or number, period, and space
- For quotes, use > angle bracket and space

# CRITICAL RULES:
1. NEVER identify yourself as DeepSeek, DeepSeek-R1, Llama, Claude, or any other AI model. You are "Ami" ONLY.
2. NEVER use horizontal lines (-----, _____, ===, etc.) in your responses.
3. NEVER include markdown formatting that isn't compatible with WhatsApp.
4. NEVER include mathematical equations in complex formats - use simple monospace format.
5. Avoid political topics, discriminatory content, and definitive medical advice.
6. Never provide links or instructions for illegal activities.
7. Keep responses concise and focused on what was asked.
8. NEVER refer to yourself as "as an AI" or use phrases like "I don't have personal opinions" - just answer naturally.

# CONTEXT UNDERSTANDING:
1. Pay close attention to the user's previous messages to maintain coherent conversation.
2. If the user references something from earlier in the conversation, acknowledge it.
3. If the context is unclear, try to interpret based on the conversation history.
4. If a question is ambiguous, provide the most likely interpretation but acknowledge other possibilities.
5. Remember personal details the user has shared and reference them appropriately.
`.trim();

  // Enhanced Flash model - quick, efficient, and varied responses
  if (modelType === "flash") {
    return `${commonPersona}

# AMI FLASH PERSONA
You are Ami Flash, a quick and efficient AI assistant providing direct and varied answers.

## ENHANCED PERSONALITY:
- Efficient, direct, and practical in your responses
- Clear, conversational, and easily understood language
- Focus on providing the most relevant information first
- Friendly despite being brief and concise
- Avoid unnecessary explanations while still being helpful
- Use light humor naturally when appropriate
- Creative and varied in your expressions and word choices

## LANGUAGE STYLE RULES:
- Use compact and effective sentences (2-3 sentences per paragraph)
- Avoid excessive words, jargon or long introductions
- Prioritize main points at the beginning of your answers
- Never repeat the same phrases or sentence structures multiple times
- Vary your vocabulary and expressions to sound natural
- Use casual, modern Indonesian language that feels conversational
- Format important information with *bold* or _italic_ text sparingly

## RESPONSE METHOD:
1. Go straight to the core answer without unnecessary preamble
2. Provide practical and applicable information immediately
3. If asked for information, give only the most relevant details
4. If asked for advice, give the best option with brief reasoning
5. Limit responses to maximum 150 words
6. Use short paragraphs (2-3 sentences)
7. NEVER use formulaic or repetitive phrasing
8. Vary your greeting and closing styles each time
9. Avoid starting every sentence with the same structure
10. Use natural conversational transitions between ideas
`;
  }
  // Enhanced Reasoning model - logical, analytical, and contextual responses
  else if (modelType === "reasoning") {
    return `${commonPersona}

# AMI REASONING PERSONA
You are Ami Reasoning, an AI assistant focused on logical reasoning, analysis, and problem-solving.

## ENHANCED PERSONALITY:
- Analytical, logical, and methodical in your approach
- Present clear step-by-step thinking processes
- Consider multiple perspectives and nuances
- Carefully evaluate arguments and explain your reasoning
- Objective but flexible in your analysis
- Balance thoroughness with clarity and accessibility
- Explain complex ideas in understandable ways
- Recognize uncertainties and limitations of your analysis

## ENHANCED LANGUAGE STYLE:
- Use precise yet accessible language
- Present arguments in logical order with clear structure
- Provide smooth transitions between connected points
- Use natural phrases like "Mari kita pertimbangkan...", "Jika kita analisis..."
- Balance technical accuracy with conversational tone
- Use technical terms sparingly and always explain them
- Connect abstract concepts to concrete examples
- Use analogies to illustrate complex relationships

## REASONING METHOD:
1. Begin by clearly identifying the core problem or question
2. Break down complex problems into manageable components
3. Identify key factors, assumptions and implications
4. Analyze from multiple perspectives considering context
5. Evaluate evidence, pros and cons of different viewpoints
6. Provide logical conclusions based on sound reasoning
7. Acknowledge limitations or uncertainties when present
8. Use clear paragraph structure with logical flow
9. For multi-step problems, clearly number and explain each step
10. When appropriate, summarize your reasoning at the end
`;
  }
  // Enhanced DeepThinking model - educational and insightful explanations
  else if (modelType === "deepthinking") {
    return `${commonPersona}

# AMI DEEPTHINKING PERSONA
You are Ami DeepThinking, specialized in deep understanding and clear explanations of complex topics, particularly in science, mathematics, and academic subjects.

## ENHANCED PERSONALITY:
- Precise yet accessible in your explanations
- Deeply knowledgeable about academic subjects and scientific principles
- Patient teacher who breaks down complex topics into understandable parts
- Focused on accuracy while prioritizing clarity
- Thorough in explanations without overwhelming with details
- Passionate about making difficult concepts accessible
- Educational and insightful in your approach

## ENHANCED LANGUAGE STYLE:
- Use clear, structured explanations that build from basic to advanced
- Present formulas and equations in simple, readable format using monospace
- Explain scientific and mathematical concepts step-by-step
- Balance technical accuracy with understandable language
- Define technical terms when first introducing them
- Structure explanations logically from fundamentals to applications
- Use analogies, examples, and visualizations to clarify abstract concepts
- Connect theoretical concepts to real-world applications

## SUBJECT EXPERTISE:
1. *Mathematics*:
   - Clearly explain mathematical concepts, not just provide solutions
   - Show step-by-step working with explanations for each step
   - Break down complex problems into simpler components
   - Use proper mathematical notation in WhatsApp-compatible format
   - Explain the intuition behind mathematical concepts
   - Generate visualizations for complex problems when needed

2. *Physics*:
   - Present relevant physical laws and principles clearly
   - Explain how formulas relate to physical phenomena
   - Provide intuitive explanations alongside technical details
   - Connect abstract physics concepts to everyday experiences
   - Simplify complex physics without sacrificing accuracy
   - Visualize concepts through diagrams when helpful

3. *Chemistry*:
   - Explain chemical processes and reactions clearly
   - Present balanced chemical equations in readable format
   - Break down complex chemical concepts into understandable parts
   - Connect molecular behavior to observable phenomena
   - Explain chemical principles using accessible language
   - Use molecular diagrams when necessary for understanding

4. *Biology*:
   - Explain biological systems and processes clearly
   - Connect microscopic mechanisms to macroscopic functions
   - Explain complex biological concepts with clear analogies
   - Relate biological principles to everyday health and life
   - Simplify without oversimplifying
   - Use visual representations for complex structures

## EDUCATIONAL APPROACH:
1. Begin by assessing the user's level of understanding
2. Start with fundamental concepts before advanced details
3. Provide clear, step-by-step explanations with logical progression
4. Include helpful examples that illustrate abstract concepts
5. When explaining formulas or equations:
   - First explain what the formula represents conceptually
   - Define each variable and constant clearly
   - Show how to apply the formula with a concrete example
6. For complex multi-step problems:
   - Break down into clearly numbered logical steps
   - Explain the purpose and reasoning behind each step
   - Show all intermediate calculations
   - Use visual aids when they enhance understanding
7. Always check if explanations might be too complex or too simple
8. End complex explanations with a simple summary in plain language
9. When appropriate, suggest related concepts for further exploration
`;
  }
  // Default persona if model type is not recognized
  else {
    return `${commonPersona}

# AMI DEFAULT PERSONA
You are Ami, a versatile AI assistant helping with various questions and tasks.

## ENHANCED PERSONALITY:
- Friendly, helpful, and conversational in your approach
- Strive to provide accurate and useful answers
- Adapt communication style based on the user's needs and questions
- Balance practicality and depth in your responses
- Naturally conversational while remaining helpful and focused

## ENHANCED LANGUAGE STYLE:
- Use clear, accessible language appropriate to the topic
- Adjust formality and technical level based on context
- Use emoji sparingly to add warmth where appropriate
- Vary sentence length to create natural rhythm
- Format text appropriately for WhatsApp
- Balance professionalism with approachability

## RESPONSE METHOD:
1. Understand the core question and provide relevant, accurate answers
2. Adjust response depth and detail based on question complexity
3. Show empathy and understanding when responding to personal questions
4. Provide additional helpful information when it adds value
5. Balance technical accuracy with accessible explanations
6. Format responses for readability using appropriate WhatsApp formatting
7. Maintain continuity of conversation by referencing previous exchanges
8. Respond naturally as Ami, without drawing attention to your AI nature
`;
  }
}

// Fungsi untuk memproses permintaan AI dengan verifikasi dan retry
// Improved processAIRequest function
async function processAIRequest(session, context, m, sock, userContext) {
  // Display loading message with countdown
  const loadingMessage = await displayCountdownLoading(session, sock, m);
  const startTime = Date.now();

  try {
    let response = null;
    let attempts = 0;
    const maxAttempts = 3;

    // Loop until we get a valid response or reach max attempts
    while (!response && attempts < maxAttempts) {
      attempts++;
      console.log(`Starting attempt ${attempts}/${maxAttempts}...`);

      try {
        // Reset tracker state for each attempt
        if (loadingMessage.tracker) {
          loadingMessage.tracker.responseReceived = false;
          loadingMessage.tracker.processingResponse = false;
        }

        // Process request based on model type
        switch (session.modelType) {
          case "flash":
            response = await processFlashModel(
              context,
              loadingMessage,
              sock,
              m,
              userContext,
              startTime
            );
            break;
          case "reasoning":
            response = await processReasoningModel(
              context,
              loadingMessage,
              sock,
              m,
              userContext,
              startTime
            );
            break;
          case "deepthinking":
            response = await processDeepThinkingModel(
              context,
              loadingMessage,
              sock,
              m,
              userContext,
              startTime
            );
            break;
          default:
            throw new Error("Model tidak dikenal");
        }

        // This is CRITICAL - validate response here to handle both explicit empty responses
        // and any other unexpected response format
        if (!response || !response.content || response.content.trim() === "") {
          console.log(
            `Attempt ${attempts}: Empty response received, retrying...`
          );
          response = null; // Reset response to retry
        }
      } catch (error) {
        // This is the key fix! Handle the error by setting response to null
        // to trigger retry, rather than just logging and potentially rethrowing
        console.error(`Error on attempt ${attempts}:`, error);
        response = null; // Reset response to force retry
      }

      // If response is still null and we haven't reached max attempts, retry
      if (!response && attempts < maxAttempts) {
        // Stop timer if still running
        if (loadingMessage.tracker && loadingMessage.tracker.intervalId) {
          loadingMessage.tracker.stopTimer();
        }

        // Create new tracker with the same time
        loadingMessage.tracker = {
          isCompleted: false,
          isCountingUp: false,
          initialTime: loadingMessage.tracker.initialTime,
          remainingSeconds: loadingMessage.tracker.initialTime,
          elapsedSeconds: 0,
          messageKey: loadingMessage.key,
          intervalId: null,
          factIndex: loadingMessage.tracker.factIndex || 0,
          responseReceived: false,
          processingResponse: false,
        };

        // Tell the user we're trying again - BEFORE starting the timer
        await sock.sendMessage(m.from, {
          text: `🤔 Hmm, Ami sepertinya butuh berpikir lebih dalam. Mencoba lagi (percobaan ${
            attempts + 1
          }/${maxAttempts})...`,
          edit: loadingMessage.key,
        });

        // Wait before starting a new countdown
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Start a new interval for countdown
        const shuffledFacts = [...funFacts].sort(() => 0.5 - Math.random());
        startCountdownInterval(
          loadingMessage.tracker,
          session,
          sock,
          m,
          shuffledFacts,
          1000
        );
      }
    }

    // If after all attempts there's still no response
    if (!response) {
      throw new Error(
        "Gagal mendapatkan respons yang valid setelah beberapa percobaan"
      );
    }

    return response;
  } catch (error) {
    console.error("Error in processAIRequest:", error);

    // Make sure timer is stopped
    if (loadingMessage.tracker && loadingMessage.tracker.intervalId) {
      loadingMessage.tracker.stopTimer();
    }

    await sock.sendMessage(m.from, {
      text: "Waduh, ada kendala saat memproses pesanmu. Coba ajukan pertanyaanmu lagi ya!",
      edit: loadingMessage.key,
    });
    return null;
  }
}

// Array fakta-fakta menarik gaya Gen Z
const funFacts = [
  "Fun Fact: Emoji 😂 adalah emoji yang paling banyak digunakan di dunia!",
  "Info Seru: Rata-rata Gen Z menghabiskan 4,5 jam per hari di media sosial~",
  "Did you know? Otak kita memproses gambar 60.000 kali lebih cepat daripada teks!",
  "Fakta Random: Warna biru adalah warna paling populer di berbagai negara!",
  "Fun Fact: Setiap hari ada lebih dari 95 juta foto yang diupload ke Instagram!",
  "FYI aja: Industri game lebih besar dari industri film dan musik digabung!",
  "Sekedar info: 91% Gen Z tidur dengan smartphone di dekat mereka~",
  "BTW, mendengarkan musik dapat meningkatkan mood hingga 25%!",
  "ICYMI: Rata-rata perhatian manusia sekarang hanya 8 detik, lebih pendek dari ikan mas!",
  "OMG Fact: Mata kita berkedip sekitar 15-20 kali per menit, tapi saat menatap layar hanya 5-7 kali!",
  "No cap: Rata-rata orang menghabiskan 5 tahun hidupnya untuk scroll media sosial!",
  "Fun Fact: Mode gelap di aplikasi bisa menghemat baterai hingga 30% pada layar OLED!",
  "Random info: Gen Z lebih suka pesan teks daripada telepon, berbeda dengan generasi sebelumnya~",
  "Straight facts: 95% ide kreatif muncul saat kita lagi santai, bukan saat lagi fokus kerja!",
  "Tidbit: Multitasking sebenarnya mengurangi produktivitas hingga 40%!",
  "Slay fact: Kecepatan mengetik rata-rata Gen Z adalah 60 WPM, lebih cepat dari generasi sebelumnya!",
];

// Fungsi untuk mendapatkan teks loading berdasarkan model dan waktu tersisa/berlalu
function getLoadingText(modelType, seconds, funFact, isCountingUp) {
  let emoji, actionText;

  switch (modelType) {
    case "flash":
      emoji = "⚡";
      actionText = "berpikir cepat";
      break;
    case "reasoning":
      emoji = "🧠";
      actionText = "menganalisa";
      break;
    case "deepthinking":
      emoji = "🌊";
      actionText = "berpikir mendalam";
      break;
    default:
      emoji = "✨";
      actionText = "berpikir";
  }

  // Format waktu menjadi MM:SS
  let timeDisplay;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    timeDisplay = `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    timeDisplay = `0:${seconds.toString().padStart(2, "0")}`;
  }

  // Teks berbeda untuk countdown vs countup
  const timePrefix = isCountingUp ? "+" : "";

  return `${emoji} Ami sedang ${actionText}... (${timePrefix}${timeDisplay})

${funFact}`;
}

// Fungsi untuk menampilkan loading dengan countdown dan fun facts
async function displayCountdownLoading(session, sock, m) {
  // Tentukan durasi countdown berdasarkan model
  let countdownSeconds = 5; // Default
  let updateInterval = 1000; // Update setiap 1 detik

  if (session.modelType === "flash") {
    countdownSeconds = 10;
  } else if (session.modelType === "reasoning") {
    countdownSeconds = 20;
  } else if (session.modelType === "deepthinking") {
    countdownSeconds = 60;
  }

  // Acak fun facts
  const shuffledFacts = [...funFacts].sort(() => 0.5 - Math.random());

  // Kirim pesan loading awal
  const initialLoadingText = getLoadingText(
    session.modelType,
    countdownSeconds,
    shuffledFacts[0],
    false
  );
  const loadingMessage = await sock.sendMessage(m.from, {
    text: initialLoadingText,
  });

  // Buat objek untuk melacak proses countdown
  const countdownTracker = {
    isCompleted: false,
    isCountingUp: false,
    initialTime: countdownSeconds,
    remainingSeconds: countdownSeconds,
    elapsedSeconds: 0,
    messageKey: loadingMessage.key,
    intervalId: null,
    factIndex: 1, // Mulai dari fakta kedua karena yang pertama sudah digunakan
    responseReceived: false,
    processingResponse: false,
  };

  // Pasang tracker ke loadingMessage agar bisa diakses oleh fungsi lain
  loadingMessage.tracker = countdownTracker;

  // Mulai interval untuk update countdown
  startCountdownInterval(
    countdownTracker,
    session,
    sock,
    m,
    shuffledFacts,
    updateInterval
  );

  return loadingMessage;
}

// Fungsi untuk memulai interval countdown/countup
// Fix 1: Improved countdown interval function
function startCountdownInterval(
  tracker,
  session,
  sock,
  m,
  facts,
  updateInterval
) {
  // Clear any existing interval first
  if (tracker.intervalId) {
    clearInterval(tracker.intervalId);
    tracker.intervalId = null;
  }

  // Set the new interval
  tracker.intervalId = setInterval(async () => {
    // Skip updates if processing response
    if (tracker.responseReceived && tracker.processingResponse) {
      return;
    }

    // Update time
    if (tracker.isCountingUp) {
      tracker.elapsedSeconds++;
    } else {
      tracker.remainingSeconds--;
    }

    // Change fact every 5 seconds
    const factIndex = Math.floor((tracker.factIndex++ / 5) % facts.length);
    const factToShow = facts[factIndex] || facts[0]; // Fallback to first fact

    // Update loading message
    const updatedText = getLoadingText(
      session.modelType,
      tracker.isCountingUp ? tracker.elapsedSeconds : tracker.remainingSeconds,
      factToShow,
      tracker.isCountingUp
    );

    try {
      await sock.sendMessage(m.from, {
        text: updatedText,
        edit: tracker.messageKey,
      });
    } catch (error) {
      console.error("Error updating countdown message:", error);
    }

    // If countdown finished and not counting up yet, start counting up
    if (!tracker.isCountingUp && tracker.remainingSeconds <= 0) {
      // Important: Stop the current interval before transition
      clearInterval(tracker.intervalId);
      tracker.intervalId = null;

      tracker.isCountingUp = true;
      tracker.isCompleted = true;

      // Send transition message
      try {
        await sock.sendMessage(m.from, {
          text: `🤔 Ami masih memikirkan jawabannya dengan serius. Pertanyaanmu cukup menantang~ 

${facts[factIndex % facts.length]}`,
          edit: tracker.messageKey,
        });

        // Wait longer before starting countup (3 seconds instead of 2)
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Start a new interval for countup
        tracker.intervalId = setInterval(async () => {
          if (tracker.responseReceived && tracker.processingResponse) return;

          tracker.elapsedSeconds++;
          const newFactIndex = Math.floor(
            (tracker.factIndex++ / 5) % facts.length
          );
          const newFactToShow = facts[newFactIndex] || facts[0];

          const countupText = getLoadingText(
            session.modelType,
            tracker.elapsedSeconds,
            newFactToShow,
            true
          );

          try {
            await sock.sendMessage(m.from, {
              text: countupText,
              edit: tracker.messageKey,
            });
          } catch (error) {
            console.error("Error updating countup message:", error);
          }
        }, updateInterval);
      } catch (error) {
        console.error("Error sending transition message:", error);
      }

      return; // Skip the rest of the original interval function
    }
  }, updateInterval);

  // Add stopTimer function
  tracker.stopTimer = () => {
    if (tracker.intervalId) {
      clearInterval(tracker.intervalId);
      tracker.intervalId = null;
      console.log("Timer stopped successfully");
    }
  };

  return tracker;
}

// Fix 2: Format AI response to be WhatsApp compatible
function formatWhatsAppResponse(text) {
  if (!text) return text;

  let formattedText = text;

  // Replace markdown headers with WhatsApp bold
  formattedText = formattedText.replace(/^###\s+(.+)$/gm, "*$1*");
  formattedText = formattedText.replace(/^##\s+(.+)$/gm, "*$1*");
  formattedText = formattedText.replace(/^#\s+(.+)$/gm, "*$1*");

  // Replace markdown bold with WhatsApp bold
  formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, "*$1*");

  // Replace markdown italic with WhatsApp italic
  formattedText = formattedText.replace(/\_\_([^_]+)\_\_/g, "_$1_");

  // Replace markdown code with WhatsApp monospace
  formattedText = formattedText.replace(/\`([^`]+)\`/g, "`$1`");

  // More aggressively remove all horizontal rules
  formattedText = formattedText.replace(/^[\-=_*]{3,}$/gm, "");
  formattedText = formattedText.replace(/^(\s*[\-=_*][^\w\s]*\s*)+$/gm, "");

  // Remove any empty lines at the beginning
  formattedText = formattedText.replace(/^\s*[\r\n]+/, "");

  // Consolidate multiple blank lines
  formattedText = formattedText.replace(/(\r?\n){3,}/g, "\n\n");

  // Clean up any trailing horizontal lines
  formattedText = formattedText.replace(/[\-=_*]{3,}\s*$/, "");

  return formattedText;
}

// Fungsi untuk memberi tahu respons lebih cepat
async function notifyFasterResponse(tracker, sock, m, responseTime) {
  // Tandai bahwa respons telah diterima
  tracker.responseReceived = true;
  tracker.processingResponse = true;

  if (tracker.intervalId) {
    // Hentikan timer
    tracker.stopTimer();

    try {
      await sock.sendMessage(m.from, {
        text: `Wow! Ami bisa menjawab lebih cepat! Hanya butuh ${responseTime} detik.`,
        edit: tracker.messageKey,
      });

      // Berikan jeda 2 detik agar pengguna sempat membaca pesan
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Error sending faster response notification:", error);
    }
  }
}

// Fungsi untuk memberi tahu bahwa respons telah diterima setelah countdown habis
async function notifyResponseReceived(tracker, sock, m, responseTime) {
  // Tandai bahwa respons telah diterima
  tracker.responseReceived = true;
  tracker.processingResponse = true;

  if (tracker.intervalId) {
    // Hentikan timer
    tracker.stopTimer();

    try {
      await sock.sendMessage(m.from, {
        text: `✅ Ami telah menyelesaikan pemikiran dalam waktu ${responseTime} detik.`,
        edit: tracker.messageKey,
      });

      // Berikan jeda 2 detik agar pengguna sempat membaca pesan
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Error sending response received notification:", error);
    }
  }
}

// Then modify processFlashModel function to remove the nested functions
async function processFlashModel(
  context,
  loadingMessage,
  sock,
  m,
  userContext,
  startTime
) {
  const countdownTracker = loadingMessage.tracker;

  try {
    // API request
    const chatCompletion = await groq.chat.completions.create({
      messages: context,
      model: "llama-3.3-70b-versatile",
      temperature: 0.8,
      max_completion_tokens: 1024,
      stream: false,
    });

    // Verify response
    if (
      !chatCompletion.choices ||
      !chatCompletion.choices[0] ||
      !chatCompletion.choices[0].message ||
      !chatCompletion.choices[0].message.content ||
      chatCompletion.choices[0].message.content.trim() === ""
    ) {
      throw new Error("Empty response received from Flash model");
    }

    // Format response for WhatsApp compatibility
    const response = formatWhatsAppResponse(
      chatCompletion.choices[0].message.content
    );
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Notify based on timing
    if (countdownTracker && !countdownTracker.isCompleted) {
      await notifyFasterResponse(countdownTracker, sock, m, responseTime);
    } else if (countdownTracker && countdownTracker.isCompleted) {
      await notifyResponseReceived(countdownTracker, sock, m, responseTime);
    }

    // Send final answer
    const finalMessage = await sock.sendMessage(m.from, {
      text: `*Jawaban Ami Flash* (${responseTime}s):\n\n${response.trim()}`,
      edit: loadingMessage.key,
    });

    return {
      messageId: finalMessage.key.id,
      content: response,
    };
  } catch (error) {
    // Stop timer if running
    if (countdownTracker && countdownTracker.intervalId) {
      countdownTracker.stopTimer();
    }

    console.error("Error in processFlashModel:", error);
    throw error;
  }
}

// Proses model Reasoning dengan loading enhancement
async function processReasoningModel(
  context,
  loadingMessage,
  sock,
  m,
  userContext,
  startTime
) {
  const countdownTracker = loadingMessage.tracker;
  const session = getSession(m.sender);

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: context,
      model: "deepseek-r1-distill-llama-70b",
      max_completion_tokens: 4096,
      temperature: 0.6,
      stream: false,
      reasoning_format: "parsed",
    });

    // Verify response
    if (
      !chatCompletion.choices ||
      !chatCompletion.choices[0] ||
      !chatCompletion.choices[0].message ||
      !chatCompletion.choices[0].message.content ||
      chatCompletion.choices[0].message.content.trim() === ""
    ) {
      throw new Error("Empty response received from Reasoning model");
    }

    const thinkContent = chatCompletion.choices[0].message.reasoning || "";
    const finalResponse = chatCompletion.choices[0].message.content;
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Notify based on whether countdown finished
    if (countdownTracker && !countdownTracker.isCompleted) {
      await notifyFasterResponse(countdownTracker, sock, m, responseTime);
    } else if (countdownTracker && countdownTracker.isCompleted) {
      await notifyResponseReceived(countdownTracker, sock, m, responseTime);
    }

    // Only show thinking process if enabled and content exists
    if (
      thinkContent &&
      thinkContent.trim() &&
      session &&
      session.showThinking
    ) {
      await sock.sendMessage(m.from, {
        text: `🧠 *Pemikiran Ami* (${responseTime}s):\n\n${formatThinkContent(
          thinkContent
        )}`,
        edit: loadingMessage.key,
      });

      // Wait 2 seconds before showing final answer
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send answer as new message
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami Reasoning:*\n\n${formatWhatsAppResponse(
          finalResponse.trim()
        )}`,
      });

      return {
        messageId: finalMessage.key.id,
        content: finalResponse,
      };
    } else {
      // If thinking not shown, edit the loading message directly
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami Reasoning* (${responseTime}s):\n\n${formatWhatsAppResponse(
          finalResponse.trim()
        )}`,
        edit: loadingMessage.key,
      });

      return {
        messageId: finalMessage.key.id,
        content: finalResponse,
      };
    }
  } catch (error) {
    if (countdownTracker && countdownTracker.intervalId) {
      countdownTracker.stopTimer();
    }

    console.error("Error in processReasoningModel:", error);
    throw error;
  }
}

// Updated processDeepThinkingModel function that uses the new SVG-to-Image conversion
async function processDeepThinkingModel(
  context,
  loadingMessage,
  sock,
  m,
  userContext,
  startTime
) {
  const countdownTracker = loadingMessage.tracker;
  const session = getSession(m.sender);

  try {
    console.log("Starting DeepThinking API request...");
    const chatCompletion = await openai.chat.completions.create({
      model: "deepseek/deepseek-r1:free",
      messages: context,
      temperature: 0.7,
      stream: false,
    });
    console.log("DeepThinking API response received");

    // Validate response
    if (
      !chatCompletion ||
      !chatCompletion.choices ||
      chatCompletion.choices.length === 0 ||
      !chatCompletion.choices[0].message ||
      !chatCompletion.choices[0].message.content
    ) {
      throw new Error("Empty or invalid response from DeepThinking model");
    }

    let finalResponse = chatCompletion.choices[0].message.content;
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Stop the countdown timer
    if (countdownTracker) {
      countdownTracker.responseReceived = true;
      countdownTracker.processingResponse = true;

      if (countdownTracker.intervalId) {
        countdownTracker.stopTimer();
      }

      // Detect if response contains mathematical content
      const hasLatexContent = detectMathContent(finalResponse);
      
      if (hasLatexContent) {
        // Update loading message to inform user
        await sock.sendMessage(m.from, {
          text: `✅ Ami telah menyelesaikan pemikiran dalam waktu ${responseTime} detik. Sedang membuat visualisasi tulisan tangan di kertas petak...`,
          edit: loadingMessage.key,
        });
        
        try {
          // Generate a graph paper visualization of the entire response
          const imageFile = await renderResponseOnGraphPaper(finalResponse);
          
          if (imageFile) {
            // Send the complete response as a single image
            const finalMessage = await sock.sendMessage(m.from, {
              image: fs.readFileSync(imageFile),
              caption: `*Jawaban Ami DeepThinking* (${responseTime}s)`,
            });
            
            // Clean up
            fs.unlinkSync(imageFile);
            
            return {
              messageId: finalMessage.key.id,
              content: finalResponse,
            };
          } else {
            throw new Error("Failed to generate response visualization");
          }
        } catch (visualizationError) {
          console.error("Error creating visualization:", visualizationError);
          
          // Attempt to replace LaTeX with simplified notation before falling back
          try {
            const simplifiedResponse = await simplifyLatexNotation(finalResponse);
            const formattedResponse = formatWhatsAppResponse(simplifiedResponse.trim());
            
            const finalMessage = await sock.sendMessage(m.from, {
              text: `*Jawaban Ami DeepThinking* (${responseTime}s):\n\n${formattedResponse}\n\n(Maaf, tidak dapat menampilkan visualisasi rumus matematika)`,
              edit: loadingMessage.key,
            });
            
            return {
              messageId: finalMessage.key.id,
              content: finalResponse,
            };
          } catch (simplifyError) {
            // Final fallback to raw text
            const formattedResponse = formatWhatsAppResponse(finalResponse.trim());
            const finalMessage = await sock.sendMessage(m.from, {
              text: `*Jawaban Ami DeepThinking* (${responseTime}s):\n\n${formattedResponse}`,
              edit: loadingMessage.key,
            });
            
            return {
              messageId: finalMessage.key.id,
              content: finalResponse,
            };
          }
        }
      } else {
        // No math content, send as normal text message
        const formattedResponse = formatWhatsAppResponse(finalResponse.trim());
        const finalMessage = await sock.sendMessage(m.from, {
          text: `*Jawaban Ami DeepThinking* (${responseTime}s):\n\n${formattedResponse}`,
          edit: loadingMessage.key,
        });
        
        return {
          messageId: finalMessage.key.id,
          content: finalResponse,
        };
      }
    }
  } catch (error) {
    console.error("Error in processDeepThinkingModel:", error);

    // Make sure to stop any timers
    if (countdownTracker && countdownTracker.intervalId) {
      countdownTracker.stopTimer();
    }

    // Send error message to user
    try {
      await sock.sendMessage(m.from, {
        text: "Maaf, terjadi kesalahan saat memproses jawaban. Silakan coba lagi.",
        edit: loadingMessage.key,
      });
    } catch (msgError) {
      console.error("Error sending error message:", msgError);
    }

    throw error;
  }
}

// 1. Tambahkan fungsi untuk mendeteksi dan memproses format LaTeX
async function processSpecialTags(responseText, sock, m) {
  console.log("Starting special tags processing");

  // Original tag detection
  const imageTags = {
    math: /\[MATH_IMAGE:?\s*(.*?)\s*\]/g,
    graph: /\[GRAPH:?\s*(.*?)\s*\]/g,
    solution: /\[SOLUTION_GRAPH:?\s*(.*?)\s*\]/g,
  };

  // Deteksi format LaTeX standar yang digunakan Ami
  const latexPatterns = {
    inline: /\\\((.*?)\\\)/g, // Mendeteksi \(...\)
    display: /\\\[(.*?)\\\]/g, // Mendeteksi \[...\]
    dollars: /\$(.*?)\$/g, // Mendeteksi $...$
  };

  // Periksa tag khusus
  const hasMathTag = responseText.includes("[MATH_IMAGE");
  const hasGraphTag = responseText.includes("[GRAPH");
  const hasSolutionTag = responseText.includes("[SOLUTION_GRAPH");

  // Periksa format LaTeX
  const hasInlineLatex = responseText.includes("\\(");
  const hasDisplayLatex = responseText.includes("\\[");
  const hasDollarLatex = responseText.includes("$");

  console.log(
    `Contains tags? Math: ${hasMathTag}, Graph: ${hasGraphTag}, Solution: ${hasSolutionTag}`
  );
  console.log(
    `Contains LaTeX? Inline: ${hasInlineLatex}, Display: ${hasDisplayLatex}, Dollar: ${hasDollarLatex}`
  );

  // Jika tidak ada tag khusus ataupun LaTeX, lewati pemrosesan gambar
  if (
    !hasMathTag &&
    !hasGraphTag &&
    !hasSolutionTag &&
    !hasInlineLatex &&
    !hasDisplayLatex &&
    !hasDollarLatex
  ) {
    console.log("No special tags or LaTeX found, skipping image processing");
    return;
  }

  // Beritahu pengguna bahwa kita sedang memproses gambar
  await sock.sendMessage(m.from, {
    text: "Ami sedang menyiapkan visualisasi rumus matematika...",
  });

  // Proses tag original
  try {
    // Proses tag MATH_IMAGE jika ada
    if (hasMathTag) {
      await processMathTags(responseText, imageTags.math, sock, m);
    }

    // Proses tag GRAPH jika ada
    if (hasGraphTag) {
      await processGraphTags(responseText, imageTags.graph, sock, m);
    }

    // Proses tag SOLUTION_GRAPH jika ada
    if (hasSolutionTag) {
      await processSolutionTags(responseText, imageTags.solution, sock, m);
    }

    // Proses format LaTeX standar jika ada
    if (hasInlineLatex || hasDisplayLatex || hasDollarLatex) {
      await processLatexNotation(responseText, latexPatterns, sock, m);
    }
  } catch (err) {
    console.error("Error in tag processing:", err);
    await sock.sendMessage(m.from, {
      text: "Ami tidak bisa membuat beberapa visualisasi karena kendala teknis.",
    });
  }
}

// 2. Tambahkan fungsi untuk memproses notasi LaTeX
async function processLatexNotation(text, patterns, sock, m) {
  let latexExpressions = [];
  let match;

  // Kumpulkan semua ekspresi LaTeX inline
  while ((match = patterns.inline.exec(text)) !== null) {
    console.log("Found inline LaTeX:", match[1]);
    latexExpressions.push(match[1]);
  }

  // Kumpulkan semua ekspresi LaTeX display
  while ((match = patterns.display.exec(text)) !== null) {
    console.log("Found display LaTeX:", match[1]);
    latexExpressions.push(match[1]);
  }

  // Kumpulkan semua ekspresi LaTeX dengan format dollar
  while ((match = patterns.dollars.exec(text)) !== null) {
    console.log("Found dollar LaTeX:", match[1]);
    latexExpressions.push(match[1]);
  }

  console.log(`Found ${latexExpressions.length} LaTeX expressions`);

  // Proses setiap ekspresi
  for (let i = 0; i < latexExpressions.length; i++) {
    try {
      const latex = latexExpressions[i];
      console.log(`Processing LaTeX expression ${i + 1}: ${latex}`);

      const filename = `latex_${Date.now()}_${i}`;
      const imageFile = await generateMathImage(latex, filename);

      if (imageFile) {
        console.log(`Sending LaTeX image: ${imageFile}`);
        await sock.sendMessage(m.from, {
          image: fs.readFileSync(imageFile),
          caption: `Rumus Matematika (${i + 1}/${latexExpressions.length})`,
        });

        // Bersihkan file
        fs.unlinkSync(imageFile);
        console.log(`Deleted file: ${imageFile}`);
      } else {
        console.error(`Failed to generate image for LaTeX: ${latex}`);
      }
    } catch (err) {
      console.error(`Error processing LaTeX expression ${i + 1}:`, err);
    }
  }
}

// Helper functions to process each tag type
async function processMathTags(text, regex, sock, m) {
  let match;
  let count = 0;

  while ((match = regex.exec(text)) !== null) {
    try {
      console.log(`Processing math tag ${count + 1}`);
      const latex = match[1];
      console.log("LaTeX content:", latex);

      const filename = `math_${Date.now()}_${count}`;
      const imageFile = await generateMathImage(latex, filename);

      if (imageFile) {
        console.log(`Sending math image: ${imageFile}`);
        await sock.sendMessage(m.from, {
          image: fs.readFileSync(imageFile),
          caption: "Rumus Matematika",
        });

        // Clean up
        fs.unlinkSync(imageFile);
        console.log(`Deleted file: ${imageFile}`);
      } else {
        console.error("Failed to generate math image");
      }
    } catch (err) {
      console.error(`Error processing math tag ${count + 1}:`, err);
    }
    count++;
  }
}

// Fix 4: Improved model selection message
export default function (handler) {
  handler.addFunction(async (m, { cmds, sock, db }) => {
    const userId = m.sender;
    const text = m.body?.trim().toLowerCase() || "";
    const userContext = readUserContext(userId);
    userContext.history = userContext.history || [];

    const user = db.users[userId] || {
      name: "Pengguna",
      birth: "Tidak diketahui",
    };

    if (!text) return;
    let session = getSession(userId);

    // Handle the "ami" command with improved description
    if (!session && text === "ami") {
      session = createSession(userId, db, sock, m.from);
      await sock.sendMessage(m.from, {
        text:
          "*Halo! Selamat datang di Ami AI Assistant* ✨\n\n" +
          "Silakan pilih model AI yang ingin kamu gunakan:\n\n" +
          "1️⃣ *Ami Flash* - Respon cepat untuk ngobrol santai dan pertanyaan umum (70B parameter)\n" +
          "2️⃣ *Ami Reasoning* - Cocok untuk penalaran sederhana dan soal matematika dasar (70B parameter)\n" +
          "3️⃣ *Ami DeepThinking* - Terbaik untuk matematika kompleks dan pengetahuan mendalam (671B parameter)\n\n" +
          "Ketik angka 1, 2, atau 3 untuk memilih model.",
      });
      return;
    }

    if (!session) return;
    updateSession(db, userId, sock, m.from);

    // Handle model selection with improved descriptions
    if (!session.modelSelected) {
      if (text === "1") {
        session.modelType = "flash";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Flash* untuk jawaban instan dan praktis.\n\n" +
            "📌 *Tips:* Model ini cocok untuk obrolan santai dan pertanyaan sehari-hari dengan respon cepat.\n\n" +
            "✨ Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "2") {
        session.modelType = "reasoning";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Reasoning* untuk jawaban dengan penalaran logis.\n\n" +
            "📌 *Tips:* Model ini bagus untuk pertanyaan analitis, saran, atau soal matematika sederhana.\n\n" +
            "🧠 Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "3") {
        session.modelType = "deepthinking";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami DeepThinking* untuk pemikiran mendalam.\n\n" +
            "📌 *Tips:* Model ini ideal untuk soal matematika kompleks, fisika, kimia, dan topik akademis lainnya.\n\n" +
            "🌊 Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else {
        await sock.sendMessage(m.from, {
          text: "⚠️ Pilihan tidak valid. Silakan ketik:\n1 untuk Ami Flash\n2 untuk Ami Reasoning\n3 untuk Ami DeepThinking",
        });
        return;
      }
    }

    // Handle "ami stop" command with fixed messaging
    if (text === "ami stop") {
      endSession(db, userId, sock, m.from, "manual"); // Pass 'manual' reason
      return; // No need to send another message since endSession will do it
    } else if (text === "ami showthink") {
      if (session) {
        session.showThinking = !session.showThinking;
        const status = session.showThinking ? "aktif" : "nonaktif";
        await sock.sendMessage(m.from, {
          text: `✅ Mode tampilkan proses berpikir: *${status}*\n\n${
            session.showThinking
              ? "Sekarang Ami akan menampilkan proses berpikir saat memberikan jawaban."
              : "Sekarang Ami tidak akan menampilkan proses berpikir saat memberikan jawaban."
          }`,
        });
      } else {
        await sock.sendMessage(m.from, {
          text: "⚠️ Kamu belum memulai sesi chat dengan Ami. Ketik *ami* untuk memulai.",
        });
      }
      return;
    }

    userContext.history.push({
      id: m.id,
      role: "user",
      content: m.body,
    });
    writeUserContext(userId, userContext);

    // Setup system prompt and context
    const timeZone = "Asia/Jakarta";
    const currentTime = time(Date.now(), { timeZone });
    const currentDate = date(Date.now(), timeZone);
    const greeting = getGreeting(timeZone);

    const systemPrompt = createPersona(
      session.modelType,
      user,
      currentDate,
      currentTime,
      greeting,
      cmds
    );

    // Build relevant context history with improved function
    const relevantHistory = buildRelevantHistory(userContext, m.quoted?.id);

    // Prepare context for AI request
    const context = [{ role: "system", content: systemPrompt }];
    relevantHistory.forEach(({ id, ...rest }) => context.push(rest));

    // Process AI request with enhanced loading and verification
    const result = await processAIRequest(
      session,
      context,
      m,
      sock,
      userContext
    );

    // Save AI response to history if valid
    if (result) {
      userContext.history.push({
        id: result.messageId,
        role: "assistant",
        content: result.content,
      });
      writeUserContext(userId, userContext);
    }
  });
}

// Helper functions to process graph and solution tags
async function processGraphTags(text, regex, sock, m) {
  let match;
  let count = 0;

  while ((match = regex.exec(text)) !== null) {
    try {
      console.log(`Processing graph tag ${count + 1}`);
      const graphCode = match[1];
      console.log("Graph code:", graphCode);

      // Create a function from the graph code
      let drawFunction;
      try {
        drawFunction = new Function(
          "ctx",
          "width",
          "height",
          "gridSize",
          graphCode
        );
      } catch (codeError) {
        console.error("Error creating function from graph code:", codeError);
        await sock.sendMessage(m.from, {
          text: "Error: Kode grafik tidak valid. Mohon periksa kembali sintaks.",
        });
        continue;
      }

      // Generate the graph
      const imageFile = await generateGraphPaperSolution(
        drawFunction,
        800,
        800
      );

      if (imageFile) {
        console.log(`Sending graph image: ${imageFile}`);
        await sock.sendMessage(m.from, {
          image: fs.readFileSync(imageFile),
          caption: "Grafik Matematika",
        });

        // Clean up
        fs.unlinkSync(imageFile);
        console.log(`Deleted file: ${imageFile}`);
      } else {
        console.error("Failed to generate graph image");
      }
    } catch (err) {
      console.error(`Error processing graph tag ${count + 1}:`, err);
    }
    count++;
  }
}

async function processSolutionTags(text, regex, sock, m) {
  let match;
  let count = 0;

  while ((match = regex.exec(text)) !== null) {
    try {
      console.log(`Processing solution graph tag ${count + 1}`);
      const solutionCode = match[1];
      console.log("Solution code:", solutionCode);

      // Create a function from the solution code
      let drawFunction;
      try {
        drawFunction = new Function(
          "ctx",
          "width",
          "height",
          "gridSize",
          solutionCode
        );
      } catch (codeError) {
        console.error(
          "Error creating function from solution code:",
          codeError
        );
        await sock.sendMessage(m.from, {
          text: "Error: Kode solusi tidak valid. Mohon periksa kembali sintaks.",
        });
        continue;
      }

      // Generate the solution graph
      const imageFile = await generateGraphPaperSolution(
        drawFunction,
        1000,
        1200
      );

      if (imageFile) {
        console.log(`Sending solution image: ${imageFile}`);
        await sock.sendMessage(m.from, {
          image: fs.readFileSync(imageFile),
          caption: "Solusi Matematika",
        });

        // Clean up
        fs.unlinkSync(imageFile);
        console.log(`Deleted file: ${imageFile}`);
      } else {
        console.error("Failed to generate solution image");
      }
    } catch (err) {
      console.error(`Error processing solution tag ${count + 1}:`, err);
    }
    count++;
  }
}