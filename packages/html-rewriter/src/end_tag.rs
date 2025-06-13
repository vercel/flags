use super::*;
use lol_html::html_content::EndTag as NativeEndTag;

#[wasm_bindgen]
pub struct EndTag(NativeRefWrap<NativeEndTag<'static>>);

impl_from_native!(NativeEndTag --> EndTag);

#[wasm_bindgen]
impl EndTag {
    #[wasm_bindgen(method, getter=name)]
    pub fn name(&self) -> JsResult<String> {
        self.0.get().map(|e| e.name())
    }

    #[wasm_bindgen(method, setter=name)]
    pub fn set_name(&mut self, name: &str) -> JsResult<()> {
        self.0.get_mut().map(|e| e.set_name_str(String::from(name)))
    }

    pub fn before(
        &mut self,
        content: &str,
        content_type: Option<ContentTypeOptions>,
    ) -> JsResult<()> {
        self.0
            .get_mut()
            .map(|e| e.before(content, content_type.into_native()))
    }

    pub fn after(
        &mut self,
        content: &str,
        content_type: Option<ContentTypeOptions>,
    ) -> JsResult<()> {
        self.0
            .get_mut()
            .map(|e| e.after(content, content_type.into_native()))
    }

    pub fn remove(&mut self) -> JsResult<()> {
        self.0.get_mut().map(|e| e.remove())
    }
}
