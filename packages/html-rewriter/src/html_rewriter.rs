use super::handlers::{
    DocumentContentHandlers, ElementContentHandlers, HandlerJsErrorWrap, IntoNativeHandlers,
};
use super::*;
use js_sys::{Function as JsFunction, Uint8Array};
use lol_html::errors::RewritingError;
use lol_html::{
    DocumentContentHandlers as NativeDocumentContentHandlers,
    ElementContentHandlers as NativeElementContentHandlers, HtmlRewriter as NativeHTMLRewriter,
    OutputSink, Selector, Settings,
};
use std::borrow::Cow;

struct JsOutputSink(JsFunction);

impl JsOutputSink {
    fn new(func: &JsFunction) -> Self {
        JsOutputSink(func.clone())
    }
}

impl OutputSink for JsOutputSink {
    #[inline]
    fn handle_chunk(&mut self, chunk: &[u8]) {
        let this = JsValue::NULL;
        let chunk = Uint8Array::from(chunk);

        // NOTE: the error is handled in the JS wrapper.
        self.0.call1(&this, &chunk).unwrap();
    }
}

//noinspection RsTypeCheck
fn rewriting_error_to_js(err: RewritingError) -> JsValue {
    match err {
        RewritingError::ContentHandlerError(err) => err.downcast::<HandlerJsErrorWrap>().unwrap().0,
        _ => JsValue::from(err.to_string()),
    }
}

#[wasm_bindgen]
#[derive(Default)]
pub struct HTMLRewriter {
    selectors: Vec<Selector>,
    element_content_handlers: Vec<NativeElementContentHandlers<'static>>,
    document_content_handlers: Vec<NativeDocumentContentHandlers<'static>>,
    output_sink: Option<JsOutputSink>,
    inner: Option<NativeHTMLRewriter<'static, JsOutputSink>>,
    inner_constructed: bool,
    asyncify_stack: Vec<u8>,
    enable_esi_tags: bool,
}

#[wasm_bindgen]
extern "C" {
    pub type HTMLRewriterOptions;

    #[wasm_bindgen(structural, method, getter, js_name = enableEsiTags)]
    pub fn enable_esi_tags(this: &HTMLRewriterOptions) -> Option<bool>;
}

#[wasm_bindgen]
impl HTMLRewriter {
    #[wasm_bindgen(constructor)]
    pub fn new(output_sink: &JsFunction, options: Option<HTMLRewriterOptions>) -> Self {
        HTMLRewriter {
            output_sink: Some(JsOutputSink::new(output_sink)),
            asyncify_stack: vec![0; 1024],
            enable_esi_tags: options.and_then(|o| o.enable_esi_tags()).unwrap_or(false),
            ..Self::default()
        }
    }

    fn assert_not_fully_constructed(&self) -> JsResult<()> {
        if self.inner_constructed {
            Err("Handlers can't be added after write.".into())
        } else {
            Ok(())
        }
    }

    fn inner_mut(&mut self) -> JsResult<&mut NativeHTMLRewriter<'static, JsOutputSink>> {
        Ok(match self.inner {
            Some(ref mut inner) => inner,
            None => {
                let output_sink = self.output_sink.take().unwrap();

                let settings = Settings {
                    element_content_handlers: self
                        .selectors
                        .drain(..)
                        .zip(self.element_content_handlers.drain(..))
                        .map(|(selector, h)| (Cow::Owned(selector), h))
                        .collect(),

                    document_content_handlers: self.document_content_handlers.drain(..).collect(),
                    enable_esi_tags: self.enable_esi_tags,
                    ..Settings::default()
                };

                let rewriter = NativeHTMLRewriter::new(settings, output_sink);

                self.inner = Some(rewriter);
                self.inner_constructed = true;

                self.inner.as_mut().unwrap()
            }
        })
    }

    pub fn on(&mut self, selector: &str, handlers: ElementContentHandlers) -> JsResult<()> {
        self.assert_not_fully_constructed()?;

        let selector = selector.parse::<Selector>().into_js_result()?;

        self.selectors.push(selector);
        let stack_ptr = self.asyncify_stack_ptr();
        self.element_content_handlers
            .push(handlers.into_native(stack_ptr));

        Ok(())
    }

    #[wasm_bindgen(method, js_name=onDocument)]
    pub fn on_document(&mut self, handlers: DocumentContentHandlers) -> JsResult<()> {
        self.assert_not_fully_constructed()?;
        let stack_ptr = self.asyncify_stack_ptr();
        self.document_content_handlers
            .push(handlers.into_native(stack_ptr));

        Ok(())
    }

    pub fn write(&mut self, chunk: &[u8]) -> JsResult<()> {
        self.inner_mut()?
            .write(chunk)
            .map_err(rewriting_error_to_js)
    }

    pub fn end(&mut self) -> JsResult<()> {
        self.inner_mut()?;
        // Rewriter must be constructed by self.inner_mut()
        self.inner
            .take()
            .unwrap()
            .end()
            .map_err(rewriting_error_to_js)
    }

    #[wasm_bindgen(method, getter=asyncifyStackPtr)]
    pub fn asyncify_stack_ptr(&mut self) -> *mut u8 {
        self.asyncify_stack.as_mut_ptr()
    }
}
